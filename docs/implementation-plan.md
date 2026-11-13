# Chowk — Implementation Plan

Principle: ship the thinnest vertical slice that proves the loop (**guest → lobby → quest → verify a step**) on a real phone, then widen. Security and privacy gates are part of each milestone's definition of done, not a later phase.

## Current state
**Done and verified (evidence in repo):**
- Revision-2 architecture: Supabase removed completely (code, config, docs, migrations). `grep -ri supabase` over tracked files returns only the "what changed" notes.
- `packages/contracts` (Zod; HTTP verification contracts moved to `api.ts`; Colyseus contract slimmed to lobby/party), typechecks.
- `packages/ports`: `DatabaseAdapter`, `AuthAdapter`, `RealtimeTicketAdapter`, `StorageAdapter`.
- `packages/db`: env validation, RLS identity binding, privileged-role guard, Node + Neon drivers. **15/15 tests pass on a real PostgreSQL 16** (not mocks). *Not yet exercised against Neon itself or a real PgBouncer.*
- `packages/storage`: local-fs adapter, **3/3 tests pass**.
- `docs/free-tier.md`: provider quotas verified from official docs on 2026-11-13, conflicts and unverified items listed.
**Not started:** all apps, schema migrations, auth, UI, realtime, game-core, CI.

## Milestones (re-sequenced to the revision-2 prompts)

### P3 — Database, auth, foundation  ✅ implemented locally (not deployed)
**Done with evidence:** 23-table Drizzle schema + migrations (RLS, grants, definer fns), seed of 3 PLACEHOLDER trails (4/5/3 steps), Better Auth (guest, magic link flag, Google wiring, linking with progress transfer, deletion), env validation, services; 43 DB + 11 auth tests + 11 HTTP smoke checks pass. **Still open:** run against real Neon/PgBouncer, real Google code exchange, Vercel deploy, shared rate limiter, `attachDatabasePool`.
- Drizzle schema + hand-written SQL (RLS, grants, definer functions) for the 17 tables in `database.md` §3; seed fictional Saddar content (3 quests, all `PLACEHOLDER`).
- Better Auth in `apps/web`: Google OAuth, guest, magic link (flagged), account deletion, `transfer_guest_progress`.
- **Spikes (gate decisions):** (a) Neon project: run the RLS suite through the real `-pooler` endpoint; measure cold-start; (b) Better Auth anonymous plugin email requirement; (c) `wrangler deploy --dry-run` bundle size + CPU test; (d) Neon Object Storage credentials for apps vs Cloudinary private delivery.
- **DoD:** migrations apply to a clean Neon branch; RLS tests per table (owner, party-mate, outsider, guest, anon, moderator); no mock DB.

### P4 — Frontend and profiles (Next.js, Tailwind, shadcn, Zustand, R3F)
Landing, auth, guest onboarding, profile/avatar/character, guidelines, safety, settings/deletion, bottom nav (Home · Explore · Play · Parties · Profile) with lobby as primary. WCAG 2.2 AA, keyboard, loading/empty/error states. **Every control wired to real server behaviour.**

### P5 — Colyseus lobby (critical)
`lobby` room, 40 players, server-authoritative movement, interpolation, emotes, AFK 3 min, reconnection, proximity chat (15 s expiry), block/mute, profanity filter, rate limits. **Two-real-client integration test.** Deployed to Render free as best-effort; wake-up UX.

### P6 — Quests, map, verification
MapLibre + OpenFreeMap; three placeholder trails; GPS (two-fix check-in), signed single-use QR, photo upload to private storage + moderation queue; all verification in Next.js server routes.

### P7 — Badges, parties, social, admin-lite
Atomic reward issuance, party rewards, invitations (block-aware), reports/blocks/mutes, submissions with consent rules, admin dashboard with DB-enforced roles; test all admin permissions.

### P8 — QA, performance, deployment readiness
Full functional matrix with evidence, security audit, mobile Safari/Chrome Playwright, deployment instructions (Workers, Render, Neon, auth, storage), explicit list of what cannot be reliable on free tiers.

## Risks (revision 2)
| Risk | Impact | Mitigation |
|---|---|---|
| **No free always-on WebSocket host verified** | lobby offline/slow to wake | best-effort lobby; app works without it; fallback = Durable Objects rewrite or self-hosted tunnel; no pinger hack |
| Workers Free 10 ms CPU | 5xx on heavy routes | thin routes, CSR game shell, cache; spike (c); fallback static export |
| Worker size limit conflict (3 MiB vs 64 MiB) | OpenNext deploy fails | spike (c) before building features |
| Neon 5-min suspend + 100 CU-h (maybe 50) | slow first request, quota exhaustion | waking UI, retry, measure; design to 50 CU-h |
| Neon storage 1 GB (maybe 0.5 GB) | writes fail | retention, size monitor, no images in DB |
| Magic link needs domain | feature unavailable | feature flag; Google + guest always work |
| Guest anonymous plugin only self-hosted | more code to own | accepted; same library |
| Neon Object Storage Beta / unknown app credentials | photo storage blocked | Cloudinary fallback behind `StorageAdapter` |
| OpenFreeMap fair-use could change | map tiles lost | style URL env; PMTiles fallback |
| Urban GPS inaccuracy, player safety, legal (age/location law) | as before | unchanged from revision 1 (SAFE/PRIV requirements preserved) |

## Definition of done (all milestones)
typecheck + lint + tests (real Postgres) green; every new table has RLS+grants+tests; every new message/route has a Zod contract + test; no privileged credential in any client/realtime artifact; docs updated; **no paid service introduced**.
