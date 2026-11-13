# Chowk — Environment Variables & External Services

Names live in [`/.env.example`](../.env.example). Limits, sleep behaviour and unverified items: [`free-tier.md`](./free-tier.md).
**Free resources only — never add a payment method to any provider account.**

## Where each secret may live
| Variable | Cloudflare (web) | Render (realtime) | Developer/CI shell | Browser |
|---|---|---|---|---|
| `DATABASE_URL` (restricted `chowk_app`, pooled) | **yes** | **NO** | tests | **NO** |
| `DATABASE_URL_UNPOOLED` (owner, direct) | **NO** | **NO** | **migrations only** | **NO** |
| `CHOWK_APP_PASSWORD` | NO | NO | bootstrap only | NO |
| `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY` | yes | NO | local | NO |
| `REALTIME_TICKET_PRIVATE_KEY` | **yes (only here)** | NO | local | NO |
| `REALTIME_TICKET_PUBLIC_KEY` | yes | yes | yes | no need |
| `QR_SIGNING_SECRET`, `STORAGE_*` secrets, `MAINTENANCE_SECRET` | yes | NO | local | NO |
| `NEXT_PUBLIC_*` | yes (build-time) | n/a | yes | yes (public by design) |

The realtime server is configured with **no database variables at all**. CI scans built client bundles and the realtime artifact for `DATABASE_URL`, the owner URL host, and private-key markers.

## Validation
`@chowk/db` `loadDbEnv()` (Zod): requires a Postgres URL, rejects the `neondb_owner` user, and on Neon outside `local` requires the `-pooler` host. Startup additionally queries `pg_roles` and refuses privileged roles. Other env schemas (auth, storage, realtime) are added per milestone using the same pattern; errors print field paths, never values.

## External services (all free tier — see `free-tier.md` for quotas)
| Service | Role | Status |
|---|---|---|
| Neon (Postgres + optional Object Storage) | database, maybe photos | to create; Free plan |
| Cloudflare Workers (OpenNext) | web + API | to create; spike for size/CPU first |
| Render free web service | Colyseus (best-effort, sleeps) | to create |
| Google Cloud OAuth client | Google sign-in | to create (no billing) |
| Email sender (Resend free) | magic link | **blocked until a verified domain exists**; otherwise disabled |
| Cloudinary Free | fallback photo storage | spike |
| OpenFreeMap | tiles | no account; verify terms |
| GitHub Actions / Worker Cron | maintenance trigger | ⚠ unverified |
