# Chowk

A mobile-first, multiplayer, real-world city exploration game. Pilot: **Saddar, Karachi**.
Players explore real public places in parties, complete quests, and prove presence through
server-verified check-ins — while their precise location never leaves the server.

> **Status: architecture + foundations only.** No application features are built yet.
> All quest content is **fictional placeholder** content. No real businesses, people, addresses or stories are used.
> The product spec was not available when this was written — see [`docs/open-questions.md`](docs/open-questions.md).

## Stack
Next.js (App Router) · TypeScript strict · Tailwind + shadcn/ui · Zustand · Colyseus · Supabase (Postgres/PostGIS, Auth, RLS) · MapLibre · React Three Fiber · Zod · Playwright · pnpm workspaces.

## Repository map
```
apps/web            Next.js PWA (M0)
apps/realtime       Colyseus server (M3)
packages/contracts  Zod schemas + realtime message contracts   ✅ typechecks
packages/game-core  Pure game rules (verification, state machine)
packages/db         Typed Supabase clients (browser + server-only)
packages/ui         shadcn/ui + tokens
packages/map        MapLibre wrappers
packages/scene3d    R3F scenes (lazy)
packages/config     Shared tsconfig / eslint / boundary rules
supabase/           migrations + RLS tests                      ✅ migration applied & smoke-tested (PG16)
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
| [docs/security.md](docs/security.md) | Threat model, privacy, safety, RLS matrix, hardening |
| [docs/implementation-plan.md](docs/implementation-plan.md) | Milestones M0–M8, risks, definition of done |
| [docs/ui-routes.md](docs/ui-routes.md) | Route + screen + component inventory |
| [docs/environment.md](docs/environment.md) | Env vars and external services |
| [docs/open-questions.md](docs/open-questions.md) | Assumptions and unresolved decisions |

## Non-negotiables
1. The phone is an untrusted sensor; **the server decides** what counts as progress.
2. Raw player coordinates are never stored, logged or rebroadcast.
3. RLS on every table; clients cannot write game state.
4. Placeholder content can never be published (DB-enforced).
5. Every location is a public space; quests default to daylight-only.

## Getting started (today)
```bash
pnpm install
pnpm typecheck        # strict TS across workspaces (contracts is the only package with code yet)
```
Applying the schema (needs the Supabase CLI): `supabase start && supabase db reset`, then `psql … -f supabase/tests/rls_smoke.sql`.

## Next
See [docs/implementation-plan.md](docs/implementation-plan.md) — recommended next milestone: **M0 Foundations**.
