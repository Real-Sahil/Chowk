# Chowk — Environment Variables & External Services

Variable names live in [`/.env.example`](../.env.example) (names only, no values). Validate with Zod at boot (M0) — the process refuses to start if a required variable is missing or a `NEXT_PUBLIC_` name looks like a secret.

## Variables
| Variable | Scope | Secret? | Required | Notes |
|---|---|---|---|---|
| `APP_ENV` | all | no | yes | `local/staging/production`; drives content gating and log verbosity |
| `LOG_LEVEL` | all | no | no | |
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | web | public | yes | anon key is safe only because RLS is on everywhere |
| `SUPABASE_SERVICE_ROLE_KEY` | realtime, jobs | **YES** | yes | Never in web. CI scans client bundle |
| `SUPABASE_JWT_ISSUER`, `SUPABASE_JWKS_URL`, `SUPABASE_JWT_AUDIENCE` | realtime | no | yes | JWT verification in `onAuth` |
| `NEXT_PUBLIC_APP_URL` | web | public | yes | auth redirects, CSP |
| `NEXT_PUBLIC_REALTIME_URL` | web | public | yes | `wss://` in staging/prod |
| `NEXT_PUBLIC_DEFAULT_LOCALE` | web | public | no | `en`/`ur` |
| `NEXT_PUBLIC_PILOT_CENTER_LAT/LNG/ZOOM` | web | public | M2 | map start; value to be supplied from reviewed config, not hard-coded |
| `NEXT_PUBLIC_MAP_STYLE_URL` | web | public | M2 | provider TBD (OQ-7) |
| `MAP_TILES_API_KEY` | web server | **YES** if used | no | proxied via `/api/tiles` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | web | public / **YES** | M1 | guest sign-in bot protection |
| `REALTIME_PORT` | realtime | no | no | default 2567 |
| `REALTIME_ALLOWED_ORIGINS` | realtime | no | yes | no wildcards in production |
| `REALTIME_MAX_ROOMS` | realtime | no | no | capacity guard |
| `REDIS_URL` | realtime | **YES** | M8 | horizontal scale only |
| `VERIFY_MAX_SPEED_MPS`, `VERIFY_COARSE_CELL_METERS` | realtime | no | no | defaults 12 and 150 |
| `SITE_CODE_PEPPER` | realtime, seed | **YES** | M4 | mixed into code hashes |
| `ALLOW_PLAYTEST_CONTENT` | realtime, seed | no | yes | must be `false` in production; mirrors `private.app_flags` |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | realtime / web | low | no | scrub PII, coordinates, tokens |
| `PLAYWRIGHT_BASE_URL`, `E2E_FAKE_GEOLOCATION` | CI | no | tests | never real devices in CI |

## External services
| Service | Used for | Needed by | Status |
|---|---|---|---|
| **Supabase** (Postgres+PostGIS, Auth w/ anonymous sign-ins, pg_cron) | data, auth, RLS | M1 | project not yet created; region undecided (OQ-4) |
| **Vercel** (or equivalent Node host for Next.js) | web hosting | M0/M1 | undecided |
| **Node host for Colyseus** (Fly.io / Render / Railway — needs WebSocket + sticky single instance) | realtime | M3 | undecided |
| **Vector tile provider** + style for MapLibre | basemap | M2 | **unresolved** (OQ-7); must permit pilot-area use and caching |
| **Cloudflare Turnstile** | guest bot protection | M1 | account needed |
| **Sentry** (or equivalent) | error tracking | M3 | optional |
| **GitHub Actions** | CI | M0 | repo exists |
| **Email provider** for Supabase magic links (SMTP) | guest upgrade | M1 | deliverability to Pakistan inboxes to be tested |
| **Redis** (Upstash etc.) | scale-out | M8 | deferred |
| Legal counsel / local content reviewers / safety advisor | policies, real content, emergency info | M7 | **external people, not software** |

## Local development (planned, M0–M1)
```
pnpm install
supabase start && supabase db reset      # applies migrations
cp .env.example .env.local               # fill from `supabase status`
pnpm dev                                 # web :3000 + realtime :2567
```
