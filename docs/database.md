# Chowk — Database

Source of truth: [`supabase/migrations/20261113000000_init.sql`](../supabase/migrations/20261113000000_init.sql).
It was applied to a clean PostgreSQL 16 and exercised with the assertions in `supabase/tests/rls_smoke.sql`
(PostGIS was shimmed in that check; run against a real local Supabase in M1 before relying on geography columns).
RLS policies are specified in [`security.md`](./security.md#5-row-level-security-model).

## Conventions
- `uuid` PKs (`gen_random_uuid()`), `timestamptz` everywhere, snake_case, enums for closed sets.
- `public` = exposed to PostgREST under RLS. `private` = helper functions, secrets, flags; **not** in the exposed schemas list.
- **No raw coordinates about players are stored.** Only quest-target geometry (authored content) uses PostGIS.
- Clients never write game state. Writers: service role (realtime server/jobs) and three security-definer RPCs.

## Entity relationships

```
auth.users 1─1 profiles
auth.users 1─* consent_records
districts 1─* locations 1─* quest_steps *─1 quests 1─* stamps
quests 1─* quest_runs *─0..1 parties 1─* party_members *─1 auth.users
quest_runs 1─* quest_run_members *─1 auth.users
quest_runs 1─* quest_run_steps *─1 quest_steps
quest_runs 1─* verification_attempts *─1 quest_steps
auth.users 1─* user_stamps *─1 stamps
auth.users 1─* reports            audit_log (standalone)
private.step_secrets 1─1 quest_steps      private.app_flags (k/v)
```

## Tables

### Identity
| Table | Purpose | Key columns / constraints |
|---|---|---|
| `profiles` | Public-ish player card | `user_id` PK→`auth.users` (cascade); `display_name` 2–24 chars; `avatar_key`; `share_coarse_location` **default false**; created by trigger `on_auth_user_created` (name `Guest-xxxxx`) |
| `consent_records` | Append-only consent ledger | `kind` (terms, privacy, location_foreground, party_location_sharing, analytics), `granted`, `policy_version`; latest row per kind wins; index `(user_id, kind, recorded_at desc)` |

Guest vs member is **not a column**: it is the JWT claim `is_anonymous` (single source of truth, upgrade flips it without a data change).

### World & content
| Table | Purpose | Notes |
|---|---|---|
| `districts` | Named areas (pilot: one placeholder district for Saddar) | optional `boundary geography(Polygon)`; `provenance` |
| `locations` | Points of interest used by steps | `geom geography(Point)` + GiST; `is_public_space` **CHECK true**; `reveal` (`always`/`on_step`); `provenance` |
| `quests` | Quest header | `status` draft→playtest→published→retired; `provenance` placeholder/reviewed; party size bounds; `daylight_only`; `content_version`; review fields. **CHECK** placeholder ⇒ never `published`; **CHECK** published ⇒ reviewer + timestamp |
| `quest_steps` | Ordered steps | `unique(quest_id, ordinal)`; `step_type`; `config jsonb` validated by `StepConfig` (contracts) at ingest and in CI |
| `stamps` | Collectible reward per quest | `provenance` |
| `private.step_secrets` | Salted hash of `site_code` answers | no client grant, RLS on with no policy |

### Social
| Table | Purpose | Notes |
|---|---|---|
| `parties` | A group | `leader_id`, `status` (forming/in_run/disbanded), `max_size` 2–6, `join_code` (6 chars, no ambiguous glyphs), `join_code_expires_at` (30 min). Partial unique index on live codes |
| `party_members` | Membership history | PK `(party_id,user_id)`; `left_at` null = live; **partial unique index → one live party per user**; `ready` flag mirrors room state at run start |

### Play
| Table | Purpose | Notes |
|---|---|---|
| `quest_runs` | One play-through (solo or party) | `party_id` nullable; `content_version` pinned; `current_ordinal`; `expires_at` (12 h) |
| `quest_run_members` | Participants snapshot | PK `(run_id,user_id)` |
| `quest_run_steps` | Per-run step state | `status` locked/available/verifying/completed; `completed_by`; link to winning attempt |
| `verification_attempts` | Audit of every verify request | **no lat/lng**; `outcome`, `distance_band`, `accuracy_m`, `reason_flags[]`; 30-day retention |
| `user_stamps` | Earned collectibles | PK `(user_id,stamp_id)` — idempotent grants |

### Safety / ops
| Table | Purpose |
|---|---|
| `reports` | Player reports (unsafe location, harassment, inaccurate content, cheating, other). Reporter can insert/read own only |
| `audit_log` | Moderation + privileged actions (kick, manual review, content publish). Service-only |

## Functions
| Function | Schema | Kind | Purpose |
|---|---|---|---|
| `is_anonymous()` | private | helper | reads JWT claim |
| `is_party_member(uuid)`, `shares_party_with(uuid)`, `is_run_member(uuid)` | private | security definer helpers | RLS predicates without recursive policy lookups |
| `quest_visible(status)` | private | helper | publication gate incl. `allow_playtest_content` flag |
| `location_revealed(uuid)` | private | helper | reveal policy for target locations |
| `create_party(size)`, `join_party(code)`, `leave_party(party)` | public | RPC (authenticated only) | the only client-callable party writers; handle leader promotion/disband |
| `handle_new_user()` | private | trigger | creates `profiles` row |
| `purge_expired()` | private | job | retention sweep; scheduled with `pg_cron` in M1 |

## Indexing & performance
FK-side indexes on every run/member lookup; GiST on `locations.geom`; `verification_attempts(created_at)` for retention; partial unique indexes double as constraints. Expected pilot volume is tiny (hundreds of concurrent players) — no partitioning, no materialised views until measured.

## Content ingest
`content/placeholder/*.json` → validated by `QuestContentFile` (contracts) → `scripts/seed-content` (M2) upserts `locations`, `quests`, `quest_steps` as `provenance='placeholder'`, `status='playtest'`. Site-code secrets are generated at seed time and printed once for the dev; never committed.

## Deferred (not in this schema on purpose)
Chat/messages (SAFE-6), friends graph, leaderboards, payments, photo evidence, push tokens, background location. Each needs a privacy review before a table exists.

## Migration policy
Forward-only timestamped migrations; every migration ships with an RLS test; `supabase db reset` + smoke suite in CI; generated types (`supabase gen types`) committed to `packages/db/src/database.types.ts` (M1).
