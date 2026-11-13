# Chowk — Security, Privacy & Safety

Priority order for every decision: **player physical safety → privacy → integrity → convenience.**
Requirement IDs (SAFE-n, PRIV-n, AUTH-n, CONTENT-n, ABUSE-n) are referenced from code and migrations.

## 1. Threat model (summary)

| Actor | Goal | Primary controls |
|---|---|---|
| Curious/abusive player | Find other players' real-time locations | PRIV-1/3: no precise location ever leaves the server; coarse cells to party only, opt-in |
| Stalker via party codes | Join strangers' parties | Short-lived, expiring, uniform-error codes; rate limits; leader kick; reports |
| Cheater | Fake GPS to finish quests | Server-side verification, plausibility, dwell, site codes; low reward value |
| Scraper | Read quest locations/answers | RLS reveal policy; code/QR secrets only in a table the app role cannot SELECT |
| Compromised client bundle | Reach privileged DB access | No privileged DB credential exists in any browser or realtime bundle; runtime role is RLS-restricted; bundle scan in CI |
| Compromised realtime host (free tier, shared) | Pivot to data | Realtime holds **no DB credentials**, only a public verification key; cannot read/write user data |
| Leaked owner/migrator URL | Bypass RLS | Owner URL (`DATABASE_URL_UNPOOLED`) exists only in the developer's/CI migration shell; runtime fails closed if it connects as a privileged role |
| Malicious WS client | Flood, malformed frames | Zod validation per message, per-type rate limits, payload caps |
| Content author error | Ship a real person/business/story by accident | CONTENT-1 DB guard, review gate |

## 2. Player safety (SAFE) — Saddar-specific design

- **SAFE-1** Every location must be a **public space** (`locations.is_public_space` CHECK). No private premises, no requirement to enter any business, no trespass.
- **SAFE-2** Quests carry `daylight_only` (default true). The client refuses to *start* a daylight-only quest outside local daylight window and warns during one. Window is computed from sunrise/sunset for the pilot coordinates (OQ-2).
- **SAFE-3** No step ever requires crossing hazardous infrastructure; authoring checklist requires a site walk-through sign-off by a human reviewer who is physically familiar with the area (recorded as `reviewed_by`/`reviewed_at`).
- **SAFE-4** Pre-run safety card: stay aware of traffic, don't play while crossing roads, play in a group where possible, how to stop (`run.abandon`) and how to reach local emergency services (numbers to be confirmed with a local advisor — OQ-3, not invented here).
- **SAFE-5** In-app **Report** on every screen of a run/party (`reports` table, write-only inbox).
- **SAFE-6** No chat in v1 (moderation burden, harassment risk). Party communication = preset emotes only.
- **SAFE-7** A "pause & hide me" control: stops sending fixes immediately, clears coarse sharing.

## 3. Privacy (PRIV)

- **PRIV-1** Raw coordinates travel client→server over TLS only, are processed in memory, and are **never rebroadcast, logged, or stored**.
- **PRIV-2** `verification_attempts` stores outcome, distance *band*, accuracy, flags — no lat/lng. Retained 30 days.
- **PRIV-3** Party members may see each other as a **grid cell** (`CoarseCell`, ~150 m, fixed server-side, jittered per room) — only if both the sharer opted in (`profiles.share_coarse_location`, default **false**) and a `party_location_sharing` consent is on record. Never to non-party users. Never historical.
- **PRIV-4** Consent ledger (`consent_records`, append-only): terms, privacy, foreground location, party sharing, analytics. Location permission is requested **just-in-time** with an explanation screen, foreground only; no background location, ever.
- **PRIV-5** Data minimisation: no phone number, real name, contacts, photos or precise device identifiers collected. Email only if the guest upgrades.
- **PRIV-6** Right to delete: self-serve account deletion cascades all user rows and deletes the user's stored objects. Guests auto-purge after 30 days inactivity.
- **PRIV-7** Analytics (if any) off by default, no location, no join codes, IDs hashed; consent-gated.
- **PRIV-8** Age: the minimum age and any parental-consent flow are a **legal decision** (OQ-1). Until resolved, ship as 18+ only in staging and do not target minors. No data is collected that would be incompatible with a later under-18 tightening.

## 4. Authentication & session security (AUTH)

- **AUTH-1** Self-hosted **Better Auth** in the Next.js server (Google OAuth, magic link when a free sender exists, anonymous guest). No client-side token handling: sessions are **server-stored**, referenced by an `HttpOnly; Secure; SameSite=Lax` cookie.
- **AUTH-2** Session lifetime short for guests (idle expiry), rotated on sign-in/link; sign-out revokes server-side; account deletion revokes all sessions.
- **AUTH-3** Realtime: browser obtains a **join ticket** (`POST /api/realtime/ticket`): Ed25519-signed, `aud` (`lobby`/`party`), `exp ≤ 60 s`, `jti`, carries `sub`, `guest`, and the user's block list. Colyseus verifies with the **public key only**; rejects wrong `aud`, expired, replayed `jti` (in-memory cache for ticket lifetime), mismatched protocol.
- **AUTH-4** CSRF: state-changing routes require same-origin (`Origin` check) + `SameSite=Lax`; server actions use Next's built-in protection.
- **AUTH-5** Secrets only in the host secret store: `BETTER_AUTH_SECRET`, OAuth client secret, ticket **private** key, storage secrets. Nothing secret is `NEXT_PUBLIC_*`.
- **AUTH-6** Guest→member linking is a single DB transaction (`transfer_guest_progress`); conflicts resolved deterministically; idempotent; audited without PII.
- **AUTH-7** Bot/abuse: per-IP and per-account rate limits on sign-in, guest creation, ticket issuance, invitation and verification routes (Workers-side limiter; Turnstile optional once its free terms are verified).

## 5. Database access control (Neon) — roles, RLS, identity propagation

### 5.1 Roles
| Role | Used by | Privileges | Credential lives in |
|---|---|---|---|
| owner / migrator (`neondb_owner` by default) | Drizzle migrations, bootstrap, `SECURITY DEFINER` function ownership | DDL, **bypasses RLS** | `DATABASE_URL_UNPOOLED` — developer shell / CI migration job **only**. Never in Workers, Render or any runtime |
| `chowk_auth` | Auth module only (Better Auth) | `LOGIN NOBYPASSRLS`; privileges on schema `auth` tables + `EXECUTE` on `app.transfer_guest_progress`/`app.maintenance_purge`; **no access to product tables** (tested) | `AUTH_DATABASE_URL` in Vercel secrets |
| `chowk_app` | Next.js server (all product DB access) | `LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`; table grants **per table, least privilege**; no default privileges | `DATABASE_URL` (pooled endpoint) in the Workers secret store |
| *(none)* realtime | — | Colyseus has **no** DB role | — |

- **DB-3 startup guard:** `createNodeAdapter/createNeonAdapter` query `pg_roles` for `current_user` and **refuse to start** if superuser/bypassrls/createrole/createdb (tested: owner credential rejected). `loadDbEnv` also rejects `neondb_owner` and (outside `local`) a non-`-pooler` Neon host.
- **DB-4** Every table in `public` **and `auth`** has RLS **enabled** and explicit grants beside its policies; `REVOKE ALL ON SCHEMA public FROM PUBLIC`. (`FORCE ROW LEVEL SECURITY` is deliberately **not** used: `SECURITY DEFINER` functions run as the table owner, who bypasses RLS by design; runtime roles never are the owner, enforced by the startup guard.)
- **DB-5** `chowk_app` cannot read the `auth` schema, so product code can never reach sessions, tokens or password hashes; `quest_step_secrets` has RLS enabled with **no policy and no grant** (unreadable to every runtime role).

### 5.2 Identity propagation (user → transaction → policy)
`DatabaseAdapter.withActor(actor, fn)`:
1. opens a single transaction;
2. `select set_config('app.user_id', $1, true)` — **transaction-local**, bound parameter, UUID validated first (`UserId.parse`);
3. runs `fn`; rollback on throw;
4. policies use `app.current_user_id()` (returns `NULL` for none/empty).

Why this is safe on Neon: the pooler is PgBouncer in **transaction mode**; session-level `SET` is unsupported and would leak across clients; `SET LOCAL`/`set_config(…, true)` is supported and resets on COMMIT/ROLLBACK. **Plain `SET app.user_id` is banned** (lint rule + test shows a stray session-level `SET` cannot override the next transaction's binding).

**Admin / moderator:** never passed in. Policies use `exists (select 1 from profiles p where p.user_id = app.current_user_id() and p.role in ('admin','moderator'))`; `profiles.role` is not updatable by `chowk_app` (no grant on the column) — only by a `SECURITY DEFINER` function that itself requires an existing admin. Server routes **additionally** check role before admin work (defence in depth, DB is the backstop).

**Privileged operations** (issue badge, record verification outcome, consume QR token, transfer guest progress, moderation actions): `SECURITY DEFINER` functions owned by the migrator, `SET search_path = ''`, `REVOKE EXECUTE FROM PUBLIC`, `GRANT EXECUTE TO chowk_app`; they validate arguments and the caller (`app.current_user_id()`) internally and are atomic (single transaction, unique constraints for exactly-once).

### 5.3 Table-level policy matrix (implemented in Prompt 3)
| Table(s) | `chowk_app` as user can | Notes |
|---|---|---|
| `profiles` | read own + live party-mates (name/avatar columns via view) · update own non-role columns | `role`, `status` not writable |
| `characters` | CRUD own | |
| `places`, `quests`, `quest_steps`, `badges` | read when published (placeholder content only visible when `ALLOW_PLAYTEST_CONTENT`, never in production) | writes only through admin functions |
| `quest_completions`, `quest_step_progress`, `user_badges` | read own / party-shared | **no direct INSERT/UPDATE** — via definer functions |
| `parties`, `party_members`, `party_invitations` | members read; invitee reads own invitations | writes via functions; **blocks enforced both directions** |
| `blocks` | CRUD own rows | |
| `reports` | insert own, read own | moderators read all (DB-derived role) |
| `submissions` | insert/read own | moderators review |
| `verification_attempts` | read own | written by definer function only; no coordinates |
| `photo_reviews`, `moderation_actions`, `audit_log` | none (moderators via functions) | append-only for actions |

### 5.4 Honest limits of RLS here
- RLS protects against application bugs (IDOR, forgotten filters), cross-user leakage and tampering through any future direct-DB exposure.
- It does **not** protect against an attacker who can run **arbitrary SQL as `chowk_app`** (they can set `app.user_id` themselves). Mitigations: parameterised Drizzle queries only (lint bans `sql.raw` with variables), no SQL-over-HTTP endpoint, restricted grants, definer functions for sensitive writes, startup role guard, no raw pool exported.
- Privilege escalation via the app role is limited by column grants (no `role` update), no DDL, no `CREATE` on `public`.
- Test coverage today: `packages/db/test/rls-context.test.ts` (15 identity-propagation tests), `schema-rls.test.ts` (24 tests on the REAL migrated schema: per-table isolation, column grants, no direct writes to progress/rewards, replay constraints, block symmetry, consent/photo/submission CHECKs, guest linking, cascading deletion) and `seed.test.ts` (4) — 43 DB tests on a real PostgreSQL 16 (isolation, WITH CHECK, no-identity, no leakage on a reused connection, rollback cleanup, injection input, DB-derived admin, no self-promotion, 40-way concurrency, owner-credential refusal, env guards). **Not yet tested through a real PgBouncer or Neon** (needs a Neon project — planned in Prompt 3's CI job).

## 6. Application hardening (ABUSE)

- **ABUSE-1** Every WS message validated with Zod (`C2S`) before any logic; unknown `type` → drop + strike. Max frame 4 KB. 3 strikes in 60 s → disconnect.
- **ABUSE-2** Rate limits: per-message table in `contracts/realtime.ts` (`C2S_RATE_LIMITS`); join-code attempts: 5 / 10 min per user and per IP at the edge, exponential backoff.
- **ABUSE-3** Idempotency: verification requests carry `(runId, stepId)`; server serialises per run (one in-flight verify per step) so double-taps can't double-advance.
- **ABUSE-4** Site-code brute force: ≤ `maxAttempts` per user/step then lockout; codes ≥ 4 chars from a non-guessable alphabet; stored salted+hashed.
- **ABUSE-5** Security headers on web: strict CSP (self + tile host + the realtime wss origin; no third-party script origins), `frame-ancestors 'none'`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: geolocation=(self), camera=(), microphone=()`.
- **ABUSE-6** CORS on realtime: allow-list of web origins only. WS origin check on upgrade. Uploads: ≤ 5 MB, JPEG/PNG/WebP by magic bytes, EXIF/GPS stripped, server-generated keys, private objects, signed reads ≤ 15 min, never auto-published (moderation queue).
- **ABUSE-7** Dependency hygiene: lockfile committed, `pnpm audit` + Dependabot in CI, `pnpm install --frozen-lockfile`, no postinstall scripts allowed except an allow-list.
- **ABUSE-8** Secrets: only in host secret stores; `.env.example` contains names only; secret-scanning on push.

## 7. Content integrity (CONTENT)

- **CONTENT-1** All initial content is fictional and `provenance = 'placeholder'`. DB constraint `quests_placeholder_never_published` makes it **impossible to publish** placeholder quests; production keeps `allow_playtest_content=false`, so placeholder content is not even readable there.
- **CONTENT-2** Placeholder titles/bodies are explicitly labelled (`[PLACEHOLDER]` prefix enforced by the content linter in CI) and must not contain real business names, real people, real addresses or real stories.
- **CONTENT-3** Going to `reviewed` requires `reviewed_by`, `reviewed_at`, and a safety walk-through (SAFE-3); the CHECK `quests_published_reviewed` enforces the DB side.
- **CONTENT-4** Placeholder coordinates in `content/placeholder/*.json` are synthetic test points flagged for replacement; they are not claims about real venues.

## 8. Retention

| Data | Retention |
|---|---|
| Raw GPS fixes | memory only, discarded after the verification decision / 60 s plausibility window |
| `verification_attempts` | 30 days (`maintenance_purge()` SQL function) |
| Guest accounts | deleted after 30 days of inactivity |
| Expired party codes / parties | disbanded after expiry; membership rows deleted with party |
| `reports` | 12 months, then anonymised (subject refs nulled) |
| `audit_log` | 12 months |

## 9. Security test plan
RLS suite on real PostgreSQL (per table × {owner, party-mate, outsider, guest, anon}; started — see §5.4); contract fuzzing of `C2S` schemas; Playwright tests for permission-denied geolocation, token-expiry reconnect, and party-code probing; bundle scan proving no `DATABASE_URL`/owner URL/private keys reach any client or realtime bundle; ZAP baseline against staging before any public pilot.
