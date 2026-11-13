# Chowk — Architecture (Neon / free-tier revision)

> **Revision 2.** Supabase has been removed completely. The product specification was never attached (see
> [`open-questions.md`](./open-questions.md)); all product behaviour is unchanged from revision 1.
> Every external service, quota and limitation is in [`free-tier.md`](./free-tier.md). **Constraint: free resources only.**

## 1. System overview

```
 Phone / desktop browser (PWA)
 Next.js UI · Tailwind/shadcn · Zustand · MapLibre · React Three Fiber · colyseus.js
   │  HTTPS (cookie session)                         │  WSS (short-lived signed join ticket)
   ▼                                                  ▼
 Next.js on Cloudflare Workers (OpenNext)            Colyseus on Render free web service  ← may SLEEP / restart
  - pages, route handlers, server services            - lobby + party presence, chat, emotes (ephemeral memory)
  - Better Auth (self-hosted) + Drizzle               - NO database credentials, NO privileged writes
  - ALL privileged game writes (verification,         - verifies ticket signature with a PUBLIC key
    rewards, moderation) happen here                  
   │ Drizzle over Neon serverless driver (WebSocket Pool), role = chowk_app (RLS enforced)
   ▼
 Neon Postgres (Free): pooled endpoint (-pooler) for runtime, direct endpoint for migrations only
   └─ also: object storage via StorageAdapter (Neon Object Storage or Cloudinary; photos private)
```

**Principles (unchanged):** the client is an untrusted sensor and display; the server decides progress; raw GPS is never stored or rebroadcast.
**New principles:** (1) *the database enforces ownership* — services connect as a restricted role subject to RLS; (2) *the realtime tier holds no secrets that can touch data*; (3) *free tiers are best-effort* — every component must degrade gracefully when asleep.

### What changed from revision 1 (and why)
| Revision 1 | Revision 2 | Reason |
|---|---|---|
| Supabase Postgres + PostgREST + RLS via `auth.uid()` | Neon Postgres + Drizzle; RLS via transaction-local `app.user_id` | Supabase removed. No PostgREST: **no database endpoint is exposed to browsers**; only our server routes touch the DB |
| Supabase Auth (anonymous sign-in, same uid on upgrade) | Self-hosted Better Auth + anonymous plugin; **guest→member progress is migrated in a DB transaction** | Neon-managed Better Auth has no anonymous plugin (verified). uid does **not** stay the same any more |
| Colyseus verifies steps, writes DB with service-role key | **Verification runs in Next.js server routes**; Colyseus is presence/chat only with no DB access | Colyseus runs on a sleeping, restartable free host; privileged writes must not live there, and a leaked realtime host must not equal DB compromise |
| Colyseus authenticates with a Supabase JWT | Realtime **join ticket** (short-lived, audience-bound, asymmetric signature) | no external IdP to verify against |
| `pg_cron` retention | Authenticated internal route + free scheduler | `pg_cron` on Neon Free not verified |
| Redis for scale-out | none | single free instance |
| `party_sync` used live GPS ring buffer in Colyseus | `party_sync` uses members' **recent accepted check-ins** (see §4.4) | verification moved server-side without realtime state |

## 2. Monorepo layout

```
apps/web                Next.js App Router (M0/Prompt 4)
apps/realtime           Colyseus (Prompt 5)
packages/contracts      Zod: domain, HTTP (api.ts) and Colyseus (realtime.ts) contracts          ✅
packages/ports          Adapter interfaces: DatabaseAdapter, AuthAdapter, RealtimeTicketAdapter, StorageAdapter ✅
packages/db             Drizzle, env validation, RLS identity binding, privileged-role guard, drivers ✅ (15 tests, real PG)
packages/storage        StorageAdapter implementations: local-fs ✅ (3 tests); neon-s3 / cloudinary after spike
packages/game-core      Pure rules: geodesic math, verification, quest state machine
packages/ui             shadcn/ui + tokens
packages/map            MapLibre wrappers
packages/scene3d        R3F scenes (lazy)
packages/config         shared tsconfig / eslint / boundary rules
content/placeholder     Fictional content (PLACEHOLDER)
tests/e2e               Playwright
```

### Dependency rules (enforced by dependency-cruiser from M0)
```
contracts → zod            ports → contracts           game-core → contracts
db → contracts, ports, drizzle-orm, pg, @neondatabase/serverless
storage → ports            map, scene3d → contracts
apps/web → contracts, ports, db, storage, game-core, ui, map, scene3d, colyseus.js, better-auth
apps/realtime → contracts, ports(types), game-core, @colyseus/*, jose    ← NEVER imports db or storage
```
1. No package imports an app; no app imports another app.
2. **`apps/realtime` must not depend on `@chowk/db`.** It has no database driver, no DB URL.
3. Nothing but `packages/db` may import `pg` / `@neondatabase/serverless` / `drizzle-orm` driver entrypoints; nothing but `apps/web/lib/auth` may read auth tables.
4. All DB access goes through `DatabaseAdapter.withActor()` — there is deliberately no exported "raw pool" for services.
5. `drizzle.config.ts` is the **only** reader of `DATABASE_URL_UNPOOLED` (owner role). Runtime env schemas have no field for it.
6. Heavy client libraries (`map`, `scene3d`) are dynamically imported.

## 3. Replaceable adapters (ports)
| Port | Interface | Implementations | Swap impact |
|---|---|---|---|
| Database | `DatabaseAdapter<Tx>` `{withActor, ping, close}` | `createNeonAdapter` (WebSocket pool; Workers) · `createNodeAdapter` (`pg`; Render, scripts, tests, any Postgres) | Any Postgres with the 001 bootstrap works (Neon → local → another host) |
| Authentication | `AuthAdapter` `{getSession, deleteUser}` + `RealtimeTicketAdapter` | Better Auth (self-hosted) | App code depends only on `AuthSession {userId,isGuest}` |
| Storage | `StorageAdapter` `{putPrivate, createSignedReadUrl, delete}` | `local-fs` (dev/test) · Neon Object Storage / Cloudinary (after spike) | Keys are server-generated; callers never see provider SDKs |

## 4. Core flows

### 4.1 Request → database identity (RLS propagation)
1. Route handler calls `auth.getSession(req.headers)` → verified server-side session (cookie, `HttpOnly; Secure; SameSite=Lax`).
2. Handler calls `db.withActor({kind:"user", userId}, tx => …)`.
3. Adapter opens **one transaction**; first statement: `select set_config('app.user_id', $1, true)` (transaction-local; `$1` bound & UUID-validated). Then caller queries run as role `chowk_app`.
4. RLS policies read `app.current_user_id()`. COMMIT/ROLLBACK resets it, so a pooled connection never carries identity to another request (**tested on a single reused connection and 40 concurrent transactions**).
5. Admin/moderator is **never** a setting: policies look up `profiles.role` inside Postgres.
6. Privileged server actions (reward issuance, verification outcome writes) are **`SECURITY DEFINER` SQL functions** owned by the migrator role with fixed logic and explicit checks — not a `system` bypass.
Honest limit: `chowk_app` can technically call `set_config` itself, so RLS defends against **application bugs** (missing `WHERE`, IDOR, forgotten checks) and against browser-side tampering, **not against arbitrary SQL execution by compromised server code**. See `security.md` §5.

### 4.2 Authentication and guest sessions
- **Providers:** Google OAuth; email magic link (**only when a free email sender is configured** — otherwise feature-flagged off, see `free-tier.md` §2); guest (Better Auth anonymous plugin).
- **Guest:** one tap → anonymous user + session cookie; random `Guest-xxxxx` profile; limited by rate limits, 30-day inactivity purge, and no ability to create public content.
- **Upgrade (account linking):** a guest signs in with Google/magic link while holding a guest session → Better Auth `onLinkAccount({anonymousUser, newUser})` runs our **`transfer_guest_progress(guest_id, new_id)` SQL function in one transaction**: reassigns `quest_completions`, `quest_step_progress`, `user_badges`, `characters`, `party_members`, `consent_records`; resolves conflicts (existing new-user rows win; duplicate badges deduplicated by unique key); then the guest user is deleted. All-or-nothing; replayable-safe (idempotent on `guest_id`).
- **Account deletion:** `DELETE /api/account` → `AuthAdapter.deleteUser` → FK `ON DELETE CASCADE`; storage objects for the user deleted first (list by key prefix); audit row without PII.
- **Sessions:** server-stored sessions, rotation on privilege change, short idle expiry for guests.

### 4.3 Realtime join (no shared DB secret)
`POST /api/realtime/ticket` (session required, rate-limited) → returns a signed ticket `{sub, guest, aud:"lobby"|"party", exp ≤ 60 s}` signed with **Ed25519 private key held only by Next.js**. Colyseus holds the **public key**, verifies signature/`aud`/`exp` in `onAuth`, and nothing else. Colyseus therefore cannot read or write user data. Block/mute lists and party membership needed by rooms are fetched by the web app and embedded in the ticket claims (small, signed, short-lived) — so the room needs no DB.

### 4.4 Quest progression and verification (server-side, in Next.js)
- Run state machine unchanged (`active → completed/abandoned/expired`; steps `locked → available → verifying → completed`), implemented in `game-core`, persisted via `withActor` + `SECURITY DEFINER` functions.
- **Replay protection:** every verification carries `attemptNonce` (UUID); `verification_attempts` has a unique `(step_progress_id, attempt_nonce)`; QR tokens are single-use (`jti` unique, consumed in the same transaction as the step advance).
- **GPS:** foreground fix posted only on user action; server computes geodesic distance (`game-core`), applies geofence radius + accuracy gate; stores outcome, distance **band**, coarse district — **never coordinates**.
- **Dwell/plausibility (alternative implementation):** there is no live position stream server-side any more. Replace "dwell over N seconds" with a **two-fix check-in**: client sends fix #1, server issues a time-bound challenge, client sends fix #2 ≥ `minDwellSec` later; server compares both (and implied speed vs the previous accepted check-in held as a *band/timestamp*, not coordinates). Weaker than a continuous stream; acceptable because rewards are cosmetic.
- **`party_sync` (alternative):** counts distinct party members with an **accepted check-in for that step within `windowSec`** (timestamps only) instead of live proximity between members.
- Colyseus is only *told* about changes via an **untrusted `run.changed` hint** relayed between clients; receivers refetch from the API, which is authoritative.

### 4.5 Party management
Parties, members, invitations live in Postgres (RLS: members see their party; invitations visible to inviter/invitee; blocks enforced in the `invite`/`join` SQL functions both ways). Presence/ready state and coarse-cell sharing are ephemeral in the Colyseus party room. Size 2–6, one live party per user (partial unique index), leader promotion in SQL.

### 4.6 Scheduled jobs
Retention sweep + expiry are SQL functions invoked by `POST /api/internal/maintenance` (shared-secret header, rate-limited) from a free scheduler (⚠ Worker Cron Trigger or GitHub Actions — see `free-tier.md`). If no scheduler is available, the same sweep also runs opportunistically (at most once/hour, guarded by a DB advisory-style row lock) at the start of authenticated requests.

## 5. Features needing an alternative implementation (summary)
| Feature | Why | Alternative |
|---|---|---|
| Always-on lobby | no verified free always-on WebSocket host | best-effort Render lobby; clients reconnect; app fully usable without it |
| Continuous-position dwell check | verification moved out of Colyseus | two-fix challenge check-in |
| Live `party_sync` | same | window of accepted check-ins |
| Guest keeps same user id on upgrade | Better Auth deletes anonymous user on link | transactional progress transfer function |
| Magic link in production | needs email sender + (likely) a domain | feature flag; Google OAuth + guest always available |
| DB-side scheduled purge (`pg_cron`) | unverified on Neon Free | internal maintenance route + free scheduler |
| Realtime scale-out (Redis) | single free instance | none; cap rooms/capacity |
| Turnstile/Sentry | free terms unverified | per-IP rate limiting; structured logs |

## 6. Performance and mobile budgets (unchanged)
Initial route ≤ 170 KB gzip JS; map/3D lazy; LCP ≤ 2.5 s on throttled 4G; GPS only on user action; lobby WebSocket ≤ 10 msgs/s/client; Workers 10 ms CPU budget tracked in CI via the dry-run + a load test (M0).

## 7. ADR log
| # | Decision | Alternatives rejected |
|---|---|---|
| 1 | Colyseus for realtime, **no DB access** | Colyseus with DB writes (leak = data compromise) |
| 2 | Raw coordinates never persisted | trails for analytics |
| 3 | Self-hosted Better Auth (guest support) | Neon managed (no anonymous), Auth.js (no guest plugin evaluated) |
| 4 | One run model for solo + party | separate tables |
| 5 | Zod contracts as source of truth | OpenAPI |
| 6 | Placeholder content structurally unpublishable | convention |
| 7 | Drizzle + `withActor` is the only DB path; restricted role + RLS | service role/owner at runtime; PostgREST/Data API |
| 8 | Privileged writes = `SECURITY DEFINER` functions | `BYPASSRLS` role; "system" claim in a setting |
| 9 | Neon `-pooler` for runtime, direct for migrations | direct everywhere (connection exhaustion) |
| 10 | Cloudflare Workers for web; Render free for Colyseus (best-effort) | Cloudflare for Colyseus (impossible); paid hosts (forbidden) |
