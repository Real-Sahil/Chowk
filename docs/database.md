# Chowk — Database (Neon PostgreSQL + Drizzle)

Status: **implemented and tested**: access layer, Drizzle schema (`src/schema`), generated + hand-written migrations (`migrations/0000_init_tables.sql`, `0001_rls_and_functions.sql`), seed (`seed/`). 43 DB tests pass on real PostgreSQL 16. **Definer functions for verification, rewards, parties and moderation are added in later stages** — until then those tables are read-only to the app role (by grants), which the tests verify. The revision-1 Supabase migration was deleted (it depended on `auth.users`, `auth.uid()`, PostgREST roles and Supabase RPCs); its design intent is carried forward below.
Quotas, sleep behaviour and pooling constraints: [`free-tier.md`](./free-tier.md). RLS model: [`security.md`](./security.md) §5.

## 1. Connections
| Purpose | Variable | Endpoint | Role | Used by |
|---|---|---|---|---|
| Runtime | `DATABASE_URL` | Neon **`-pooler`** host (PgBouncer, transaction mode) | `chowk_app` (RLS enforced) | Next.js server only |
| Migrations / bootstrap / definer-function ownership | `DATABASE_URL_UNPOOLED` | Neon **direct** host | owner | `drizzle-kit`, `scripts/bootstrap-app-role.sh` — a developer or CI job; **never a deployed runtime** |
| Auth module | `AUTH_DATABASE_URL` | Neon `-pooler` | `chowk_auth` (auth schema only) | Better Auth |
| Tests | `DATABASE_URL`, `AUTH_DATABASE_URL`, `TEST_OWNER_URL` | throwaway local Postgres | `chowk_app`, `chowk_auth`, superuser | `packages/db`, `apps/web` tests |

Pooling rules (verified, see free-tier §1): no session `SET`, no `LISTEN/NOTIFY`, no SQL-level `PREPARE`, no session advisory locks, no `WITH HOLD` cursors. Identity binding uses `set_config(..., true)` inside the transaction. Runtime on Workers uses the `@neondatabase/serverless` **WebSocket `Pool`** (interactive transactions); Node processes use `pg`. Pool size `DB_POOL_MAX` default 5. Neon compute sleeps after 5 minutes idle: the first query after idle is slower — the API must tolerate it (timeouts ≥ 10 s, retry once on connection error).

## 2. Access layer (implemented)
```
packages/db/src
  env.ts      DbEnv (Zod): DATABASE_URL, DB_POOL_MAX; rejects neondb_owner; requires -pooler on Neon outside `local`
  context.ts  bindActor(): set_config('app.user_id', $1, true) with UUID-validated bound param
  guard.ts    assertUnprivilegedRole(): refuses superuser / bypassrls / createrole / createdb
  adapter.ts  createNodeAdapter() / createNeonAdapter() -> DatabaseAdapter.withActor(actor, tx => ...)
packages/db/sql/001_roles_and_context.sql   schema app, role chowk_app, app.current_user_id()
packages/db/scripts/bootstrap-app-role.sh   creates login password out-of-band (psql variable)
packages/db/scripts/with-test-db.sh         throwaway Postgres + vitest
```
There is no exported raw pool and no `sql.raw`-with-variables policy: **every query runs inside `withActor`**.

## 3. Entities (Prompt 3 implements as Drizzle schema + SQL migrations)
Conventions: `uuid` PKs (`gen_random_uuid()`), `timestamptz`, snake_case, enums as Postgres enums or `CHECK`ed text, `created_at/updated_at` everywhere, `ON DELETE CASCADE` from `users` for personal data, **RLS enabled and explicit grants on every table** (no `FORCE`; see security.md DB-4).

### Identity (Better Auth tables + ours)
- `user, session, account, verification` — created by Better Auth's Drizzle adapter (schema `public` or `auth`; read **only** by the auth module).
- **`profiles`** `user_id` PK→user (cascade), `display_name` (2–24, CHECK), `avatar_key`, `role` enum(`player`,`moderator`,`admin`) default `player` (**not writable by `chowk_app`**), `status` enum(`active`,`suspended`,`deleted_pending`), `is_guest` (mirrors auth), `share_coarse_location` default **false**, **consent fields**: `terms_version`, `terms_accepted_at`, `privacy_version`, `privacy_accepted_at`, `location_consent_at`, `party_location_consent_at`, `analytics_consent` (default false), `last_seen_at`.
- **`characters`** `id`, `user_id` FK, `name`, `appearance` jsonb (validated by Zod; whitelist keys/palette), `story` text (≤ 600), unique `(user_id)` for the primary character, `created_at`.

### World & content
- **`places`** `id`, `slug` unique, `name`, `kind` enum(`food`,`maker`,`market`,`landmark`,`square`), `district` text (coarse), `geom` as `lat`/`lng` numeric with CHECK ranges (PostGIS is **not assumed on Neon Free** — ⚠ verify; geodesic math is done in `game-core`), **`geofence_radius_m`** CHECK 15–150, **`opening_hours`** jsonb (weekly schedule, validated), **`accessibility_notes`**, **`safety_notes`**, `is_public_space` **CHECK true**, `provenance` enum(`placeholder`,`reviewed`), `consent_basis` (for places tied to a real person/business: `none|owner_consent|public_landmark`), `active`.
- **`quests`** `id`, `slug`, `title`, `summary`, `difficulty` enum(`easy`,`medium`,`hard`), `estimated_minutes`, `reward_xp`, `reward_badge_id`→badges, `available_from/until` + `time_window` (night market), `min_party_size/max_party_size` (1–6), `daylight_only`, `provenance`, `status` enum(`draft`,`playtest`,`published`,`retired`), `content_version`, `reviewed_by/at`. **CHECK:** placeholder ⇒ never `published`; published ⇒ reviewer + timestamp.
- **`quest_steps`** `id`, `quest_id`, `ordinal` unique per quest, `place_id`, `title`, `clue`, `story_unlock`, **`verification_method`** enum(`gps`,`qr`,`photo`,`narrative`), `config` jsonb (Zod-validated per method), `qr_secret_hash` — column **not granted** to `chowk_app` (read inside definer functions only).
- **`badges`** `id`, `slug`, `name`, `description`, `scope` enum(`individual`,`party`), `art_key`, `provenance`.

### Play
- **`quest_completions`** `id`, `user_id`, `quest_id`, `party_id` nullable, `completed_at`, **unique `(user_id, quest_id)`** → exactly-once, `content_version`.
- **`quest_step_progress`** `id`, `user_id`, `quest_id`, `step_id`, `status` enum(`locked`,`available`,`pending`,`completed`), `completed_at`, **unique `(user_id, step_id)`**. Party play: one row per member; shared progress = party view over members' rows.
- **`verification_attempts`** `id`, `progress_id`, `user_id`, `method`, `outcome` enum(`accepted`,`rejected_*`,`pending_review`), `distance_band`, `accuracy_m`, `coarse_district`, `qr_jti`, **`attempt_nonce` — unique `(progress_id, attempt_nonce)` = replay protection**, **unique `qr_jti`** (single-use QR tokens), `created_at`. **No coordinates stored.** 30-day retention.
- **`user_badges`** `user_id`, `badge_id`, `quest_id`, `party_id`, `issued_at`; **PK `(user_id, badge_id)`** → duplicate rewards impossible; issued only by `issue_badge()` definer function in the same transaction as the completion row.

### Social & safety
- **`parties`** `id`, `leader_id`, `status`, `max_size` CHECK 2–6, `join_code` (30-min TTL, unique among live), `created_at`.
- **`party_members`** PK `(party_id,user_id)`, `role` enum(`leader`,`member`), `left_at`, `shares_location` default false (consent); **partial unique one-live-party-per-user**.
- **`party_invitations`** `id`, `party_id`, `inviter_id`, `invitee_id`, `status` enum(`pending`,`accepted`,`rejected`,`expired`,`revoked`), `expires_at`, unique pending `(party_id, invitee_id)`; creation/accept functions reject if **either side blocked the other**.
- **`blocks`** `blocker_id`, `blocked_id`, `created_at`, PK pair, CHECK `blocker_id <> blocked_id`. (Mute is client/room-local state + stored list `mutes` if persistence is wanted.)
- **`reports`** `id`, `reporter_id`, `subject_user_id?`, `subject_party_id?`, `subject_place_id?`, `kind` enum(`harassment`,`impersonation`,`spam`,`safety`,`inappropriate_content`,`inaccurate_content`,`cheating`,`other`), `detail` ≤ 500, `status` enum(`open`,`triaged`,`closed`), `created_at`.
- **`submissions`** nominations: `id`, `submitter_id`, `kind` enum(`person`,`place`,`business`,`story`,`quest_idea`), `title`, `body`, `subject_consent` enum(`not_applicable`,`obtained`,`pending`,`refused`) — **CHECK: a `person` submission cannot be approved/published unless `subject_consent='obtained'`**, `contains_private_address` flag set by moderators (such submissions cannot be published), `status` enum(`pending`,`approved`,`rejected`), `reviewed_by/at`.
- **`photo_reviews`** `id`, `attempt_id`, `owner_id`, `storage_key` (private), `status` enum(`pending`,`approved`,`rejected`), `reviewer_id`, `reviewed_at`, `reason`, `published` boolean default **false** (owner opt-in required before any visibility beyond moderators).
- **`moderation_actions`** append-only: `id`, `actor_id`, `action` enum(`warn`,`suspend`,`unsuspend`,`approve`,`reject`,`remove_content`,`role_change`), `target_type`, `target_id`, `reason`, `created_at`. UPDATE/DELETE revoked from every runtime role.
- `audit_log` — append-only privileged-action trail (no PII payloads).

## 4. Security-definer function inventory (Prompt 3–7)
`transfer_guest_progress`, `record_verification` (consumes nonce/QR jti, advances progress), `issue_badge` (atomic, idempotent), `create_party / join_party / leave_party / invite / respond_invitation`, `block_user / unblock_user`, `moderate_*` (admin-gated inside), `maintenance_purge`, `delete_user_data`. Each: owner = migrator, `SET search_path = ''`, `REVOKE ALL FROM PUBLIC`, `GRANT EXECUTE TO chowk_app`, validates `app.current_user_id()` and arguments.

## 5. Retention
Raw GPS: never persisted. `verification_attempts`: 30 days. Guest accounts: 30 days inactivity. Expired invitations/parties: swept. `reports`/`moderation_actions`/`audit_log`: 12 months (reports anonymised after). Photos: deleted with the account; rejected photos purged after 14 days. Neon Free storage cap is 1 GB (≥0.5 GB assumed) — retention is also a **capacity** requirement; a size monitor alerts at 70 %.

## 6. Migration policy
Drizzle Kit generates SQL; **hand-written SQL migrations** carry RLS policies, grants and definer functions (Drizzle's schema DSL does not model them all). Applied with the **direct** URL by a developer or CI job, never at app start. Forward-only; each migration ships with RLS tests on real Postgres (CI service container) and, before release, on a **Neon branch** (free: 10 branches/project).
