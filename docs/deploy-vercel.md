# Deploying Chowk (foundation build) — Vercel Hobby + Neon Free

**Status: NOT deployed.** In this environment the **Neon connector is not installed** and the **Vercel connector is read-only** (list/get projects and deployments only; no create/deploy), so nothing below has been executed against real services. Once you import the repo into Vercel, the read-only connector can be used to inspect deployments and build logs. Everything was verified locally against a real PostgreSQL 16 and the built Next.js server (see "Evidence"). Follow these steps yourself; stop at any step that asks for a payment method.

> **Vercel Hobby is non-commercial only** (verified, see `free-tier.md` §3a). Use it for building and testing. Do not use it if Chowk earns revenue or is run as a business (OQ-14).

## 1. Neon (free)
1. Create a Neon project on the **Free** plan (no card). Pick the region closest to your Vercel function region and to Karachi players; note Neon's free compute **suspends after 5 minutes idle**.
2. Copy **two** connection strings from the dashboard: the **direct** one (owner) and the **pooled** one (host contains `-pooler`).
3. From your own machine (never CI logs, never Vercel):
   ```bash
   export DATABASE_URL_UNPOOLED='<direct owner string>'
   export CHOWK_APP_PASSWORD="$(openssl rand -base64 36)"
   export CHOWK_AUTH_PASSWORD="$(openssl rand -base64 36)"
   bash packages/db/scripts/bootstrap-app-role.sh      # creates roles chowk_app + chowk_auth
   pnpm --filter @chowk/db db:migrate                  # applies Drizzle migrations (tables, RLS, functions)
   pnpm --filter @chowk/db db:seed                     # PLACEHOLDER quests (hidden unless playtest flag on)
   ```
4. Build the two runtime URLs by taking the **pooled** host and substituting the role + password: `postgres://chowk_app:<pw>@<pooled-host>/<db>?sslmode=require` and `postgres://chowk_auth:<pw>@<pooled-host>/<db>?sslmode=require`.
5. ⚠ **Unverified on Neon** (verify immediately): that `CREATE ROLE ... NOBYPASSRLS` works for the owner role on Free, and that the RLS identity tests pass through the real `-pooler` endpoint. Re-run `packages/db/test/*` against a Neon **branch** (free: 10 branches) by setting `TEST_OWNER_URL`, `DATABASE_URL`, `AUTH_DATABASE_URL` and calling `vitest run` directly.
6. To make seeded placeholder quests visible in a staging/test deployment only: `update app.flags set value = true where key = 'allow_playtest_content';` (run as owner). **Never in production.**

## 2. Vercel (free Hobby)
1. Import the GitHub repo. **Root Directory: `apps/web`**. Framework: Next.js. Node 22. Package manager: pnpm (detected from `packageManager`).
2. Install command: default (`pnpm install` at the monorepo root works with Vercel's root-directory handling; enable "Include source files outside of the Root Directory").
3. Environment variables (Production + Preview; mark secrets as Sensitive). **Do not add `DATABASE_URL_UNPOOLED`.**
   | Variable | Value |
   |---|---|
   | `APP_ENV` | `staging` (use `production` only after a commercial-use decision and real content) |
   | `DATABASE_URL` | `chowk_app` pooled URL |
   | `AUTH_DATABASE_URL` | `chowk_auth` pooled URL |
   | `BETTER_AUTH_SECRET` | `openssl rand -base64 48` |
   | `BETTER_AUTH_URL` | your deployment origin, e.g. `https://<project>.vercel.app` |
   | `GUEST_MODE_ENABLED` | `true` |
   | `MAGIC_LINK_ENABLED` | `false` (default). **Not needed**: visitors get an automatic guest session (`POST /api/session`), no login or email. Magic link/Google are optional upgrades only. The `console` email provider is refused when `APP_ENV=production`. |
   | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | optional; create a Google Cloud OAuth client (no billing) with redirect URI `<BETTER_AUTH_URL>/api/auth/callback/google` |
4. Function region: choose the Vercel region nearest your Neon region (Project → Settings → Functions).
5. Deploy. Check `GET /api/health` → `{"ok":true}` (the first call after idle may be slow: Neon wakes up).
6. At first deploy add `attachDatabasePool` from `@vercel/functions` around the `pg` pools in `lib/services.ts` (Vercel's recommendation; not yet added because it could not be tested locally).

## Login is optional
Every visitor is given a guest session automatically (30-day sliding cookie, no email/password). Guest progress lives with that browser's cookie: **clearing cookies loses a guest account**. Linking Google (optional, needs your Google OAuth client) or magic link (optional, needs an email sender) moves the guest's progress to a permanent account and is never required to play.

## 3. What is deployed vs not
- ✅ Auth (guest, magic link when enabled, Google when configured), profile, character, account deletion, health.
- ⏳ No UI beyond a placeholder page (next stage), no lobby (Colyseus, later stage), no quest/verification APIs yet.
- ❌ Not possible on free tiers: always-on realtime (Render free sleeps), production magic-link email without a domain, commercial use on Vercel Hobby.

## Evidence (what actually ran, locally)
| Check | Result |
|---|---|
| `pnpm typecheck` (all workspaces, strict) | 0 errors |
| `@chowk/db` tests (real PG 16, real migrations) | 43 / 43, stable over repeated runs |
| `@chowk/storage` tests | 3 / 3 |
| `@chowk/web` tests (real Better Auth + real DB) | 16 / 16 |
| `next build` | succeeds; routes `/api/auth/*`, `/api/profile`, `/api/character`, `/api/account`, `/api/health` |
| Smoke test of the built server over HTTP (`apps/web/scripts/smoke.sh`) | 12 / 12 pass |
| Against Neon / Vercel / real Google | **not run** |
