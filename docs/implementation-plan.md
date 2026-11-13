# Chowk — Implementation Plan

Principle: ship the thinnest vertical slice that proves the loop (**guest → map → quest → verify a step**) on a real phone, then widen. Security and privacy gates are part of each milestone's definition of done, not a later phase.

## Current state (M-1, this change)
Done: monorepo skeleton (pnpm workspaces, strict TS base), `packages/contracts` (Zod, typechecks), initial Postgres migration with RLS + RPCs (applied and smoke-tested on PG16), docs, `.env.example`.
Not started: every app, `game-core`, `ui`, `map`, `scene3d`, CI, content.
Existing code preserved: the repository contained only a one-line `README.md`, which was replaced by the full README.

## Milestones

### M0 — Foundations (≈ 1 week)
- `apps/web`: Next.js App Router + TS strict, Tailwind, shadcn/ui init in `packages/ui`, PWA manifest + service worker shell, `next-intl` (en/ur, RTL).
- `packages/config`: eslint (incl. `no-restricted-imports` per boundary rules), `dependency-cruiser` config, env validation (Zod) for web/realtime.
- CI (GitHub Actions): `pnpm install --frozen-lockfile`, typecheck, lint, unit, boundary check, bundle-size budget, secret scan.
- Playwright scaffold with geolocation-mocked context and a smoke test.
- **DoD:** blank PWA installable, passes budget, CI green, service-role-key bundle scan wired.

### M1 — Auth, consent, data layer (≈ 1.5 weeks)
- Supabase local project; apply migration; `supabase gen types` → `packages/db`.
- pgTAP RLS suite (convert `rls_smoke.sql`; add guest/anon/outsider matrix); `pg_cron` jobs for `purge_expired` and guest purge.
- Guest sign-in (Turnstile), email upgrade, profile, consent ledger UI, account deletion/export, legal page stubs.
- **DoD:** guest→member upgrade keeps uid; RLS suite green in CI; delete-account cascades verified.

### M2 — Map & quest browsing with placeholder content (≈ 1.5 weeks)
- `packages/map` (MapLibre, lazy), pilot centre from env, GPS status chip, location rationale + denied states.
- Content pipeline: `QuestContentFile` validator + linter (`[PLACEHOLDER]` prefix, no-real-names heuristic list) + seed script; 1–2 fictional quests (see `content/placeholder/`).
- Routes: `/map`, `/quests`, `/quests/[slug]`, onboarding safety/location, settings.
- **DoD:** on a mid-tier Android over throttled 4G, LCP ≤ 2.5 s, map chunk lazy, offline shell works; placeholder quests visible in staging only.

### M3 — Party & realtime lobby (≈ 2 weeks)
- `apps/realtime` Colyseus: `onAuth` (JWKS), `PartyRoom` (roster, ready, kick, leave, emotes, coarse-cell sharing opt-in), reconnection, rate limiter + strikes, structured logs.
- `packages/db/server` typed service-role functions; `/party/*` UI; report sheet.
- **DoD:** headless harness scenarios pass; 200 rooms × 4 clients load test within CPU budget; no coordinates in logs (test asserts).

### M4 — Runs & verification (≈ 2 weeks)
- `game-core`: geodesic math, geofence+dwell+plausibility verifier, quest state machine, party_sync quorum, site-code check — 100 % unit tested with injected clock.
- Server: `run.start`, verify handlers, transactions, idempotency, `verification_attempts`, audit log.
- UI: run HUD, verify button states, site-code entry, sync meter.
- **DoD:** field test at a **synthetic** location with 3 phones; spoof scenarios (teleport, low accuracy, replay) rejected; double-tap safe.

### M5 — Rewards & polish (≈ 1 week)
- Stamps, completion screen, R3F reveal (lazy, reduced-motion aware), stamp collection page.
- Perf pass (budgets), a11y audit (axe + manual screen-reader), Urdu QA.

### M6 — Moderation & content review tooling (≈ 1 week)
- `/admin` (separate role + MFA): report triage, manual verification review, content review/publish flow that sets `reviewed_by/at`.
- **DoD:** a quest can only reach `published` through this flow (DB CHECK already backstops).

### M7 — Pilot readiness (≈ 1–2 weeks, **blocked on external inputs**)
- Real, reviewed Saddar content by local authors with site walk-throughs (SAFE-3); legal texts; emergency-info; age policy; ZAP baseline; incident runbook; privacy impact assessment; app-store/PWA store decisions.
- Flip nothing to production until all are signed off.

### M8 — Scale & hardening (post-pilot)
Redis driver/presence for >1 realtime process, region choice review, abuse analytics (privacy-reviewed), push notifications (needs new privacy review).

## Cross-cutting backlog
- ADR process (append to `architecture.md` §5).
- Threat-model review at end of M3 and M4.
- Dependabot + audit weekly; release checklist.

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Urban GPS inaccuracy (dense Saddar streets, multipath) | High | Failed verifications, frustration | Radius ≥ 15 m configurable per step, accuracy gate tuned from field data, site-code fallback step type |
| Player safety incident | Low–Med | Severe | SAFE-1…7, daylight default, public-space-only, local reviewer sign-off, report flow |
| Mobile web background/tab-suspension kills GPS & sockets | High | Broken sessions | Foreground-only design, fast reconnection, resume UI; evaluate native wrapper only if pilot data demands |
| Content authenticity/sensitivity | Med | Reputational | Placeholder-only until local reviewers; CONTENT-1 guard |
| Legal (age, location data, local regs) | Med | Blocks launch | Early counsel (OQ-1), minimal-data design |
| Colyseus single-node limit | Low (pilot) | Outage | Budget tests in M3, Redis path in M8 |
| Tile provider cost/availability | Med | Map broken | Provider TBD (OQ-7); style abstraction in `packages/map`; cache pilot bbox |

## Definition of done (all milestones)
Typecheck + lint + boundary check + tests green; new tables have RLS + tests; new messages have Zod contracts + tests; docs updated; no new secret in client; budgets met.
