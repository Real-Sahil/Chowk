# Chowk — Architecture

> **Status of the spec.** The product specification referred to in the brief was not attached to the
> session and is not in the repository. This document is built from the brief itself (mobile-first
> multiplayer IRL city exploration, launching in Saddar, Karachi; guest sessions, quests, parties,
> verification; fictional placeholder content). Every assumption is listed in
> [`open-questions.md`](./open-questions.md) and must be reconciled with the real spec before M1.

## 1. System overview

```
 ┌────────────────────────── Phone (PWA, mobile web) ──────────────────────────┐
 │ Next.js App Router UI · Tailwind/shadcn · Zustand · MapLibre · R3F          │
 │  ├─ HTTPS  ───────────────►  Next.js route handlers / server actions        │
 │  ├─ Supabase JS (anon key, user JWT, RLS) ─► Supabase (Postgres+Auth)       │
 │  └─ WSS (Colyseus client, JWT in join options) ─► Realtime server           │
 └──────────────────────────────────────────────────────────────────────────────┘
        Next.js (Vercel)                    Colyseus (Node, 1 region, Fly/Render/Railway)
        - SSR shell, SEO, auth callbacks    - PartyRoom: presence, readiness, run state
        - BFF for non-realtime writes       - SERVER-AUTHORITATIVE verification
        - never holds service-role key      - holds service-role key (only place besides jobs)
                         \                      /
                          ▼                    ▼
                    Supabase Postgres (RLS on every table, PostGIS)
                    Supabase Auth (anonymous sign-in + email upgrade)
                    Map tiles: self-hosted/ vendor vector tiles (open question OQ-7)
```

**Principle:** the phone is an untrusted *sensor and display*. It reports a GPS fix and renders state.
Everything that grants progress (verification, step advancement, stamps) happens on the Colyseus server,
which writes to Postgres with the service role through a narrow, audited module (`packages/db/server`).

### Why this split
| Concern | Where | Reason |
|---|---|---|
| UI, routing, SSR shell, installable PWA | Next.js | App Router, streaming, easy mobile perf budgets |
| Durable data, auth, RLS | Supabase | One managed Postgres; RLS gives defence in depth |
| Party presence, live run state, verification | Colyseus | Stateful rooms, reconnection, schema-based patching; a serverless host cannot hold sockets |
| Shared types | `packages/contracts` (Zod) | One definition for HTTP, WS and content files; runtime-validated |

Rejected: Supabase Realtime for game state (no authoritative server logic, weaker anti-cheat);
a custom Express+ws server (re-implements Colyseus rooms, reconnection, and state sync).

## 2. Monorepo layout

```
chowk/
├─ apps/
│  ├─ web/                 # Next.js App Router PWA                      (M0)
│  └─ realtime/            # Colyseus server                             (M3)
├─ packages/
│  ├─ contracts/           # Zod schemas + WS message contracts  ← EXISTS, typechecks
│  ├─ game-core/           # Pure logic: geo math, verification rules, quest state machine
│  ├─ db/                  # Typed Supabase clients; /browser, /server (service-role) entry points
│  ├─ ui/                  # shadcn/ui components, design tokens, Tailwind preset
│  ├─ map/                 # MapLibre wrapper components/hooks
│  ├─ scene3d/             # React Three Fiber scenes (lazy-loaded)
│  └─ config/              # shared tsconfig, eslint, dependency-cruiser rules
├─ supabase/
│  ├─ migrations/          # 20261113000000_init.sql  ← EXISTS, applied+smoke-tested on PG16
│  └─ tests/               # rls_smoke.sql (pgTAP in M1)
├─ content/placeholder/    # Fictional quest JSON, validated by QuestContentFile in CI
├─ tests/e2e/              # Playwright
└─ docs/
```

### Package boundaries and dependency rules

Allowed edges only (arrow = "may import"). Enforced by `dependency-cruiser` in CI (M0) — a violation fails the build.

```
contracts   → (zod only)
game-core   → contracts
db          → contracts                      (db/server is importable ONLY by apps/realtime and scripts)
ui          → (react, radix, tailwind)       (no game logic, no contracts imports except types)
map         → contracts, game-core(types)
scene3d     → contracts
apps/web    → contracts, game-core, db/browser, ui, map, scene3d, colyseus.js
apps/realtime → contracts, game-core, db/server, colyseus
```

Hard rules:
1. **No package imports from `apps/*`.** No app imports another app.
2. `apps/web` must never import `db/server`, `@colyseus/core`, or read `SUPABASE_SERVICE_ROLE_KEY`. CI greps the client bundle for the key name.
3. `game-core` is pure (no I/O, no `Date.now()` — time is injected) so rules are unit-testable and shared between server verification and client hints.
4. `contracts` has one runtime dependency (`zod`). No React, no Node APIs.
5. `scene3d` and `map` are loaded with `next/dynamic` (`ssr:false`) so they never enter the initial JS budget.
6. Any new cross-package edge requires an ADR line in this file.

### Tech decisions
- **TypeScript strict** with `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` (`tsconfig.base.json`).
- **State:** server state via Server Components/route handlers + TanStack-free minimal fetch; **Zustand** only for client-ephemeral state (map viewport, current room connection, UI sheets). Zustand stores never persist location.
- **Colyseus state schema is minimal** (party roster, ready flags, run progress). Position is *not* in synced state; coarse cells are sent as discrete messages only when sharing is on (see protocol doc).
- **Zod 4** at every trust boundary: HTTP bodies, WS payloads, content files, env vars (`packages/config/env.ts`, M0).
- **Mobile performance budgets** (enforced in CI via Lighthouse/size-limit, M0): initial route ≤ 170 KB gzipped JS; map chunk lazy; R3F chunk lazy and only on `/quest/[id]/reveal` style screens; LCP ≤ 2.5 s on throttled 4G mid-tier Android; GPS sampled at ≤ 0.5 Hz, `watchPosition` stopped when the tab is hidden.

## 3. Flows

### 3.1 Authentication and guest sessions
1. First visit: user sees `/welcome`. They accept Terms/Privacy (consent ledger rows) and choose **Play as guest** or **Sign in**.
2. **Guest:** `supabase.auth.signInAnonymously()` (Turnstile-protected, OQ-5). A real `auth.users` row is created with `is_anonymous=true`; a DB trigger creates `profiles` with a random `Guest-xxxxx` name. Guests have the same `authenticated` DB role, so RLS and RPCs work unchanged; differences are policy-level (see security doc).
3. **Upgrade:** `supabase.auth.updateUser({ email })` / `linkIdentity` — **the user id does not change**, so runs, stamps and party membership carry over with zero data migration.
4. **Guest lifecycle:** anonymous users inactive > 30 days are deleted by a scheduled job (cascade deletes everything). Guests are told this at creation.
5. **Realtime auth:** client passes the current Supabase access token in `PartyJoinOptions.accessToken`. Colyseus `onAuth` verifies signature (JWKS), `exp`, `aud`, and reads `sub` + `is_anonymous`. Token is never stored in room state or logged. On token expiry mid-session the client reconnects with a fresh token (rooms allow reconnection, 60 s).
6. **Sign-out / delete account:** `DELETE /api/account` calls the admin API → cascade. Also exposed in `/settings/privacy`.

### 3.2 Quest progression
State machine (implemented in `game-core`, executed only by the realtime server):

```
Run:   active ──all steps completed──► completed
        │ └─abandon (any member / leader if party)──► abandoned
        └─ expires_at passed (12 h) ───────────────► expired

Step:  locked ──previous completed──► available ──verify request──► verifying
                                          ▲                            │ accepted ─► completed
                                          └──── rejected / timeout ────┘
```
- A **run** is the single model for solo and party play. `quest_runs.party_id` is null for solo.
- `quest_run_members` is a snapshot of who participates; late joiners are not added in v1.
- Steps are strictly ordered by `ordinal`. Exactly one step is `available` at a time (v1).
- `content_version` is pinned on the run so editing a quest never corrupts in-flight runs.
- On last step accepted: run → `completed`, stamps granted to every member present in the run, `run.completed` broadcast.
- Reveal policy: target locations are `on_step` by default — RLS only returns a location once its step is `available` for a run you belong to (exploration, and anti-spoiling).

### 3.3 Party management
- **Create** (`rpc create_party`): leader gets a 6-char join code, TTL 30 min, size 2–6. Code alphabet excludes ambiguous characters.
- **Join** (`rpc join_party(code)`): uniform failure for unknown/expired/full (no probing). Rate-limited per user and per IP at the edge (ABUSE-2).
- **One live party per user** — unique partial index.
- **Presence & readiness** are Colyseus state (`party` room). Postgres records membership; the room records who is connected/ready.
- **Leader leaves** → oldest member promoted; empty → disbanded. **Kick** is leader-only, executed server-side, audited.
- **Starting a run:** leader sends `run.start` when ≥ `min_party_size` members are ready; server creates `quest_runs`/`quest_run_members`/`quest_run_steps` in one transaction and flips party to `in_run`.
- **Disconnects:** a member offline > 5 min is marked disconnected (still a member); `party_sync` steps count only connected members.

### 3.4 Verification
Server-authoritative; clients only *ask*. Full rules in `game-core/verification.ts` (M4); contract in the protocol doc.

| Step type | Evidence | Checks (all server-side) |
|---|---|---|
| `geofence` | GPS fix | `accuracyM ≤ maxAccuracyM`; geodesic distance to target ≤ `radiusM` (PostGIS `ST_DWithin` or haversine in game-core); **dwell**: ≥ `minDwellSec` of consecutive in-radius fixes; **plausibility**: implied speed vs previous fix ≤ 12 m/s, no teleport |
| `site_code` | Short code displayed at a physical, public placeholder marker | constant-time compare to salted hash in `private.step_secrets`; ≤ `maxAttempts` per user per step, then 10 min lockout |
| `party_sync` | Fixes from N members | ≥ `minMembersPresent` members with fresh (≤ `windowSec`) accepted fixes inside `radiusM` of each other/target |
| `narrative` | none | auto-advance on acknowledgement |

Outcomes: `accepted`, `rejected_distance|accuracy|dwell|code|suspicious`, `pending_review`. We do **not** hard-ban on one signal: suspicious patterns raise `reason_flags`, and repeated flags route to manual review. Responses give only a coarse distance band (`very_close/close/far`) so the API cannot be used as a distance oracle. **Raw coordinates are never written to the database** — only the band, accuracy bucket and flags (PRIV-2).

GPS honesty: browser geolocation can be spoofed; the design assumes this and makes cheating *low value* (no money, no competitive ranking in v1) rather than pretending to be unspoofable.

## 4. Cross-cutting

- **Observability:** structured JSON logs with request/room id; never log coordinates, tokens or join codes. Sentry (errors, scrubbed) + Colyseus monitor behind admin auth. Metrics: room count, verification outcome mix, p95 message latency.
- **Offline/poor network (Karachi reality):** the PWA caches the shell and quest text; map tiles for the pilot bounding box are cacheable; verification requests retry with idempotency keys (`runId+stepId+attemptNonce`).
- **Deployment:** web on Vercel; realtime on a single-region Node host close to users (sticky, single process for MVP; Redis presence/driver only when scaling horizontally — M8); Supabase region nearest available (OQ-4).
- **Environments:** `local` (Supabase CLI + `pnpm dev`), `staging` (placeholder content allowed via `allow_playtest_content`), `production` (flag permanently false until reviewed content exists).
- **Accessibility & localisation:** English + Urdu (RTL) are first-class from M0: logical CSS properties, `dir` set per locale, no text in images. See UI doc.

## 5. ADR log
| # | Decision | Alternatives |
|---|---|---|
| 1 | Colyseus for realtime, authoritative verification | Supabase Realtime; custom ws |
| 2 | Raw location never persisted; only bands/flags | Store trails for analytics (rejected, privacy) |
| 3 | Guest = Supabase anonymous user (same uid on upgrade) | Custom guest tokens (extra auth surface) |
| 4 | One run model for solo + party | Separate solo/party tables |
| 5 | Zod contracts as the single source of truth | OpenAPI/ts-rest (heavier for a 2-service system) |
| 6 | Placeholder content structurally unpublishable (DB CHECK + flag) | Convention only |
