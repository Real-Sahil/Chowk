# Chowk — Free-Tier Reality Check

**Constraint:** Chowk may use free resources only. No paid APIs, subscriptions or infrastructure.
**Verified on 2026-11-13** against provider documentation (links per row). Provider limits change; re-verify before launch.
Rows marked **⚠ unverified** were NOT confirmed from an official page in this pass — treat them as open items, not facts.
Where official pages disagreed, both values are shown and the conflict is flagged.

## Summary decision table

| Need | Chosen (free) | Persistent & reliable for free? | Key risk |
|---|---|---|---|
| Database | **Neon Postgres, Free plan** | Yes (data persists); compute **sleeps** | cold-start latency after 5 min idle; 100 CU-h/month; 1 GB |
| Auth | **Self-hosted Better Auth** inside Next.js (Drizzle adapter) | Yes | magic-link email needs a free sender (see below) |
| Frontend + API | **Vercel Hobby** (starting point); Cloudflare Workers (fallback) | Yes, within quotas | **non-commercial use only**; account pauses when limits hit |
| Realtime (Colyseus) | **Render free web service** (only verified free Node host with WebSockets) | **NO** — sleeps, restarts any time | lobby is ephemeral; ~1 min wake-up |
| Images | **Neon Object Storage** (primary, pending spike) / **Cloudinary Free** (fallback) | Neon: yes in beta; Cloudinary: yes | Neon storage is Beta; Cloudinary credit pool |
| Maps | **MapLibre + OpenFreeMap** tiles | Yes (no key) | fair-use policy could change |
| Email (magic link) | Free sender with verified domain, else dev-only fallback | Partly | domain ownership ⚠ |
| Scheduled jobs | Worker Cron Trigger ⚠ / GitHub Actions schedule ⚠ | ⚠ | neither verified |

## 1. Neon (database) — [plans](https://neon.com/docs/introduction/plans), [Free-plan FAQ](https://neon.com/faqs/free-plan-limits-and-quotas)
- Free plan: **100 CU-hours/project/month**, autoscaling up to **2 CU**, **1 GB storage per project** (20 GB across all free projects), **10 branches/project**, **5 GB public network transfer/project/month**, 100 projects.
- **Scale-to-zero: idle compute suspends after 5 minutes and this cannot be disabled on Free.** Suspended compute uses no CU-hours.
- Overages are not billed on Free: when CU-hours run out compute is **suspended until the next period**; storage overages make **growing writes fail**. No data is deleted.
- **Source conflict:** some Neon blog/FAQ pages still say 50 CU-hours and 0.5 GB. The plans doc is more recent (100 CU-h, 1 GB). **We design for the lower figures** (50 CU-h ≈ 200 h of 0.25 CU; 0.5 GB) so a doc correction cannot break us.
- Cold-start latency after suspend: not quantified in the sources checked. **Measure in M-Deploy**; UI must show a "waking up" state.
- Pooling: PgBouncer in **transaction mode** via the `-pooler` hostname, up to 10,000 client connections. Session `SET`, `LISTEN/NOTIFY`, SQL `PREPARE`, temp tables (PRESERVE ROWS), session advisory locks are **unsupported** through the pooler. `SET LOCAL` / `set_config(..., true)` **work** (transaction-scoped). Use the **direct** (unpooled) host for migrations. ([connection pooling](https://neon.com/docs/connect/connection-pooling))
- Capacity maths (design target): at 0.25 CU, 100 CU-h ≈ 400 compute-hours ≈ 13 h/day of awake compute. Idle suspend means actual use is lower; a pilot with bursty evening traffic fits, an always-busy app would not.

## 2. Authentication — Neon Auth vs self-hosted Better Auth
Sources: [Managed Better Auth](https://neon.com/docs/auth/overview), [managed vs self-host FAQ](https://neon.com/faqs/managed-better-auth-vs-self-hosting-better-auth), [Better Auth anonymous plugin](https://better-auth.com/docs/plugins/anonymous).
- Neon's **managed** Better Auth supports email+password, social OAuth (incl. Google), Email OTP, **Magic Link**, Admin, JWT, Phone. **It does NOT include the Anonymous plugin** (guest mode) — that exists only in **self-hosted** Better Auth.
- **Decision: self-host Better Auth** (free, open source) in the Next.js app with the Drizzle adapter; auth tables live in our Neon DB. Same library as Neon's managed offering, so moving to managed later is possible if guests are dropped or re-implemented.
- Better Auth core requires an email on every user record per the docs surfaced; the anonymous plugin supplies a placeholder email for guests (**verify during M-Auth**; if not, guests get synthetic `guest-<uuid>@guest.invalid`).
- Neon's shared SMTP (managed only) is **development-only, rate-limited, and does not support verification links** — not usable in production regardless.
- Google OAuth: free to use; needs a Google Cloud project and OAuth client (⚠ consent-screen verification requirements and any limits not checked here).

### Magic-link email (the one auth feature that needs an email sender)
- [Resend free plan](https://resend.com/docs/knowledge-base/account-quotas-and-limits): **100 emails/day, 3,000/month, 3 verified domains**; sent and received both count; HTTP 429 when exceeded.
- ⚠ **Unverified:** whether Resend lets free accounts send to arbitrary recipients **without** a verified sending domain. Assume a domain is required. A domain name costs money, so **production magic links are blocked until the owner already holds a domain** (we will not buy one silently).
- **Free working alternatives:** (a) development: log the link to the server console / local Mailpit; (b) production without a domain: Google OAuth + guest mode remain fully functional and magic link is **disabled behind a feature flag**. (c) ⚠ Brevo/others not evaluated.
- Render blocks outbound **SMTP ports 25/465/587** on free services — so email must go over an HTTPS API (Resend), never raw SMTP, from Render. Magic-link sending happens in Next.js (Workers), not Render.

## 3a. Vercel Hobby (chosen starting host for the web app) — [Hobby plan](https://vercel.com/docs/plans/hobby), [limits](https://vercel.com/docs/limits), [fair use](https://vercel.com/docs/limits/fair-use-guidelines), [functions](https://vercel.com/docs/functions/limitations)
- **Hobby is restricted to non-commercial, personal use.** If Chowk earns revenue, sponsorship or is run by a company, Hobby is not permitted (**OQ-14**). Moving to a paid Vercel plan is forbidden by our constraint, so a commercial launch means moving to the Cloudflare fallback or another free host.
- Current docs: **1,000,000 function invocations/month**, **4 h Active CPU**, **360 GB-hrs provisioned memory**, 100 GB Fast Data Transfer, 10 GB Fast Origin Transfer, 1M CDN requests; function max duration **300 s**; **2 GB / 1 vCPU**; 100 deployments/day, 1 concurrent build. **Over-limit behaviour: the account pauses for the period (it is not billed on Hobby).** (An older "legacy pricing" page lists 100k invocations / 100 GB-h — treated as outdated.)
- **WebSockets:** Vercel Functions now support WebSockets in **public beta** on all plans (Fluid compute), but connection lifetime is bounded by the function's max duration, new connections are not guaranteed to land on the same instance and in-memory state is per instance (shared state needs Redis). **Not suitable for Colyseus** (stateful rooms) → Colyseus stays on a separate host. (Older community posts saying "no WebSockets" are outdated.)
- **Database:** Node runtime allows TCP, so the standard `pg` driver works; Vercel recommends a **module-scope pool** (what `lib/services.ts` does) and `attachDatabasePool` from `@vercel/functions` so idle clients are released before suspension (**to be added at first deploy**). The Edge runtime blocks TCP — we use the Node runtime (`export const runtime = "nodejs"` on every route).
- ⚠ Not verified: Vercel Cron availability/limits on Hobby (affects the maintenance schedule); region latency to the chosen Neon region (set the function region to match Neon's).

## 3b. Cloudflare (fallback frontend + API) — [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [OpenNext](https://opennext.js.org/cloudflare)
- Workers Free: **100,000 requests/day** (reset 00:00 UTC; over-limit returns error 1027), **10 ms CPU time per request**, 50 subrequests/request, startup ≤ 1 s. (CPU time excludes time waiting on I/O such as DB queries — but auth, JSON, and SSR work all count.)
- **Worker size:** conflicting official pages — a Cloudflare changelog and the newer Limits page say **64 MiB uncompressed for Free and Paid** (compressed limits removed); an older indexed copy of the Limits page and the OpenNext docs still say **3 MiB (Free)**. **Verify with `wrangler deploy --dry-run` in M0 before committing to Next.js on Workers.**
- **Risk:** 10 ms CPU for Next.js SSR + Better Auth session validation + Drizzle queries is tight. Mitigations: static-first routes, client-side rendering for the game shell, cache public reads, keep route handlers thin. If the dry-run or load test shows frequent CPU-limit errors, fallback = **static export + a small number of API routes** or another host (⚠ Vercel Hobby, Cloudflare Pages-specific free limits **not evaluated**; Vercel Hobby is understood to restrict commercial use — verify before relying on it).
- **Cloudflare cannot host Colyseus.** Colyseus is a long-lived Node.js server; Workers Free cannot run it. Durable Objects (SQLite-backed only on Free; 100k requests/day, **WebSocket messages count as requests at a 20:1 billing ratio**, 13,000 GB-s/day, 5 GB storage) can hold WebSockets but would require **rewriting the lobby without Colyseus**. Not chosen (Colyseus is a stated requirement); recorded as the **fallback** if Render's sleep behaviour proves unacceptable.

## 4. Realtime hosting — the hard constraint
Source: [Render free docs](https://render.com/docs/free), [WebSocket changelog](https://render.com/changelog/free-web-services-now-remain-active-while-receiving-websocket-messages).
- Render free web service **supports WebSockets**. It **spins down after 15 minutes without inbound HTTP *or* WebSocket messages** (a changelog says WebSocket messages now count; older community threads said otherwise — we rely on the docs).
- Wake-up after spin-down: **~1 minute**, during which Render serves a loading page; new WebSocket connections wake it.
- **750 instance-hours/workspace/month**, shared across free services; exceeding suspends all free services until next month. One service awake 24/7 ≈ 744 h — fits one service only.
- May be **restarted at any time**; **no persistent disk**; local files lost on redeploy/spin-down; one instance only (no scaling); no private-network inbound; SMTP ports blocked; **suspended for unusually high outbound traffic or when outbound bandwidth exceeded** (no payment method on file).
- Render says **not for production**. Free Postgres expires after 30 days (we do not use it).
- **Consequence — explicit:** *no verified free service provides reliable, always-on persistent WebSocket hosting.* The Colyseus lobby on free hosting is a **best-effort, ephemeral, may-sleep service**. Design rules: lobby state is disposable (nothing authoritative lives only in memory); clients auto-reconnect and show "waking server (~1 min)"; no DB dependency in the connection hot path; do **not** use keep-alive pingers to defeat spin-down (it burns the 750 h, and ToS acceptability is unverified).
- ⚠ Not evaluated: Koyeb, Railway, Fly.io (understood to have ended a free tier), Oracle Cloud Always Free (requires a payment card for sign-up), home server + free tunnel. A self-hosted machine with a free tunnel is the only route to always-on, at the owner's own cost of electricity/hardware.

## 5. Object storage (photos)
- **Neon Object Storage** ([overview](https://neon.com/docs/storage/overview)): S3-compatible; branches with the DB; docs say **Beta** (a blog says the backend is GA — conflict); regions us-east-2, us-east-1, eu-central-1 (Frankfurt), ap-southeast-1 (Singapore); **Free plan includes 5 GB/project** (per search summary of the pricing page — re-confirm); **bucket ACLs/policies not supported**; Neon's own guidance for private files is **private bucket + server-minted short-lived presigned GET URLs after an ownership check in Postgres** ([guide](https://neon.com/faqs/store-private-user-files-expiring-links)).
  - ⚠ **Unverified:** how to obtain S3 credentials for use *outside* Neon Functions (from a Worker/Next.js). **Spike required (M-Storage)**; if credentials cannot be issued to our app on the Free plan, fall back to Cloudinary.
- **Cloudinary Free** ([billing docs](https://cloudinary.com/documentation/billing_and_plans)): **25 credits/month pool** (1 credit = 1,000 transformations or 1 GB storage or 1 GB bandwidth); no card required; 3 users. Old blog posts quote larger separate quotas (10 GB/20 GB) — **outdated/conflicting**. Private (`private`/`authenticated`) delivery types + signed URLs exist ([access control](https://cloudinary.com/documentation/control_access_to_media)); ⚠ one old post says authenticated *CDN* delivery needs a higher plan — **unverified for current Free**; spike before use.
- Decision: implement the **`StorageAdapter` port** with a dev **local-fs** implementation now (done, tested); production adapter chosen by the M-Storage spike. Photos: server-side size cap 5 MB, magic-byte check, JPEG/PNG/WebP only, EXIF/GPS stripping before storage (M6), private by default, never auto-published.

## 6. Maps
- **OpenFreeMap** ([quick start](https://openfreemap.org/quick_start/)): MapLibre-compatible style URLs, no API key/registration; its docs state no limits on public instance. Third parties caution fair-use limits may appear later. ⚠ Official usage page not fetched — verify before launch.
- **Do not use OpenStreetMap's own tile servers for the app**: the [OSMF tile usage policies](https://operations.osmfoundation.org/policies/tiles/) restrict heavy/bulk use and are for the community, not app production traffic.
- Fallback: self-hosted **PMTiles** extract on static storage (⚠ not evaluated; needs a free host with range requests).
- Attribution to © OpenStreetMap contributors is mandatory in the map UI.

## 7. Other services from the original plan
| Original | Now |
|---|---|
| Supabase Auth/RLS/Realtime | removed entirely |
| Cloudflare Turnstile (guest bot protection) | ⚠ believed free; **not verified** — optional; fall back to per-IP rate limits (Worker) |
| Sentry | ⚠ free tier **not verified**; default is structured logs only |
| Redis/Upstash | removed (single Colyseus instance; no scale-out on free tier) |
| `pg_cron` | not assumed on Neon (⚠ unverified); retention runs via an authenticated internal route triggered by a scheduler (⚠ Worker Cron / GitHub Actions free allowances not verified) |

## 8. Deployment restrictions to remember
1. Frontend on Workers: 100k requests/day total across page + API + asset requests that hit the Worker; static assets served separately do not use Worker CPU (⚠ confirm quota treatment).
2. Realtime may be **down or waking** at any time; the app must be fully usable (quests, profile, parties via HTTP) with the lobby offline.
3. Neon may be **waking**; first request after idle is slower.
4. No paid fallback is configured anywhere; hitting a quota means degraded service, not a bill. **Never add a payment method to any of these accounts.**
