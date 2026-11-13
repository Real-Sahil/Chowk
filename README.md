# Chowk

A mobile-first, multiplayer, real-world city exploration game. Pilot: **Saddar, Karachi**.
Players explore real public places in parties, complete quests, and prove presence through
server-verified check-ins — while their precise location never leaves the server.

> **Status: architecture + foundations only.** No application features are built yet.
> All quest content is **fictional placeholder** content. No real businesses, people, addresses or stories are used.
> The product spec was not available when this was written — see [`docs/open-questions.md`](docs/open-questions.md).

## Stack
Next.js (App Router) on Cloudflare Workers · TypeScript strict · Tailwind + shadcn/ui · Zustand · **Neon Postgres + Drizzle ORM + PostgreSQL RLS** · **self-hosted Better Auth** · Colyseus (Render free, best-effort) · MapLibre + OpenFreeMap · React Three Fiber · Zod · Playwright · pnpm workspaces.

**Free resources only.** No paid APIs, subscriptions or infrastructure; see [docs/free-tier.md](docs/free-tier.md) for verified quotas, sleep behaviour and what cannot be reliable for free.

## Repository map
```
apps/web            Next.js PWA (M0)
apps/realtime       Colyseus server (M3)
packages/contracts  Zod schemas: domain, HTTP (api.ts), Colyseus (realtime.ts)   ✅ typechecks
packages/ports      Adapter interfaces (database, auth, realtime ticket, storage)    ✅
packages/game-core  Pure game rules (verification, state machine)
packages/db         Drizzle + Neon/pg drivers, RLS identity binding, role guard      ✅ 15 tests on real Postgres
packages/storage    StorageAdapter implementations (local-fs today)                  ✅ 3 tests
packages/ui         shadcn/ui + tokens
packages/map        MapLibre wrappers
packages/scene3d    R3F scenes (lazy)
packages/config     Shared tsconfig / eslint / boundary rules
content/placeholder Fictional quest data (labelled PLACEHOLDER)
tests/e2e           Playwright
docs/               Architecture & design docs
```

## Documentation
| Doc | Contents |
|---|---|
| [docs/architecture.md](docs/architecture.md) | System design, package boundaries, auth/guest, quest, party and verification flows, ADRs |
| [docs/database.md](docs/database.md) | Schema, relationships, functions, retention |
| [docs/realtime-protocol.md](docs/realtime-protocol.md) | Colyseus rooms, messages, rate limits, errors |
| [docs/free-tier.md](docs/free-tier.md) | **Verified** free-tier quotas, sleep behaviour, restrictions, unverified items |
| [docs/security.md](docs/security.md) | Threat model, privacy, safety, DB roles, RLS identity propagation, hardening |
| [docs/implementation-plan.md](docs/implementation-plan.md) | Revision-2 milestones (P3–P8), risks, definition of done |
| [docs/ui-routes.md](docs/ui-routes.md) | Route + screen + component inventory |
| [docs/environment.md](docs/environment.md) | Env vars and external services |
| [docs/open-questions.md](docs/open-questions.md) | Assumptions and unresolved decisions |

## Non-negotiables
1. The phone is an untrusted sensor; **the server decides** what counts as progress.
2. Raw player coordinates are never stored, logged or rebroadcast.
3. Services connect as a restricted Postgres role; RLS on every table; identity is bound per transaction; clients cannot write game state. The realtime server holds **no database credentials**.
4. Placeholder content can never be published (DB-enforced).
5. Every location is a public space; quests default to daylight-only.

## Getting started (today)
```bash
pnpm install
pnpm typecheck                      # strict TS across workspaces
pnpm --filter @chowk/db test        # starts a throwaway PostgreSQL, runs 15 RLS/identity tests, tears it down
pnpm --filter @chowk/storage test   # 3 storage adapter tests
```
Requires local PostgreSQL server binaries for the db tests (or set `TEST_OWNER_URL` + `DATABASE_URL` to a throwaway database).
Neon setup (when you create a project): run `packages/db/scripts/bootstrap-app-role.sh` with the **direct** URL, then use the **pooled** `chowk_app` URL as `DATABASE_URL`.

## Next
See [docs/implementation-plan.md](docs/implementation-plan.md) — next stage: **P3 — schema migrations, Better Auth, seed data (with the four spikes listed there)**.
