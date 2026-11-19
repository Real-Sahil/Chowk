# Chowk — Pakistan go-live checklist

Status key: ☐ not started · ◐ in progress · ☑ done (with evidence). Owners: **F** founder, **C** counsel/local advisor, **E** engineering.

## 1. Product (stages from implementation-plan.md)
- ◐ P4 frontend: landing + map shell (done: `/`, `/explore`); onboarding, profile/avatar, settings, safety card (☐) — E
- ☐ P5 lobby: server-authoritative movement, emotes, block/mute, two-real-client test — E
- ◐ P6 map/quests: map renders with placeholder markers (tiles unverified from CI sandbox); GPS two-fix check-in, signed QR, photo moderation (☐) — E
- ☐ P7 badges, parties, reports/blocks, admin roles tested — E
- ☐ P8 mobile Safari/Chrome Playwright run, security audit, load test — E

## 2. Legal and safety (slowest — start now)
- ☐ Minimum age and parental consent (OQ-1) — F + C
- ☐ Applicable Pakistani data-protection / online-safety rules — C
- ☐ Privacy policy, terms, community guidelines — F + C
- ☐ Safety card with verified local emergency numbers (OQ-3) — C
- ◐ Account deletion tested end to end (server path tested; UI ☐) — E

## 3. Content
- ☐ Replace every PLACEHOLDER place/trail/badge with reviewed Saddar content; named reviewer per quest (OQ-9) — F
- ☐ Confirm pilot map centre and bounds (OQ-2); default in code is approximate — F
- ☐ Languages: English + Urdu/RTL? (OQ-8) — F
- ☐ Partner/sponsor content needs contracts (OQ-6) — F

## 4. Security and secrets
- ☐ Rotate neondb_owner, chowk_app, chowk_auth passwords (they appeared in chat) — E + F
- ☐ Remove Neon integration owner-level variables from Vercel; recreate BETTER_AUTH_SECRET as Sensitive — F + E
- ☐ Shared rate limiter; bot check on sign-up — E
- ☑ Health endpoint green on production (`/api/health` → `{"ok":true}`)
- ☑ Email + password sign-up (tested against a real database; live user test pending)

## 5. Infrastructure and cost
- ☐ Always-on lobby decision (OQ-13) — F
- ☐ Vercel Hobby is non-commercial: decide plan if Chowk earns money (OQ-14) — F
- ☐ Neon free limits: load test, usage alerts, measured Karachi latency (Singapore region) — E
- ☐ Photo storage choice (Neon object storage vs Cloudinary) — E
- ☐ Map tile terms for production (OpenFreeMap) and a fallback (OQ-7) — E

## 6. Operations
- ☐ Error monitoring, uptime check on /api/health, backup + tested restore — E
- ☐ Moderation process (who, response time, bans) and support contact — F
- ☐ Closed pilot (~20 people in Saddar on mid-range Android over 3G/4G) before public launch — F + E
