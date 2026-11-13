# Chowk — Security, Privacy & Safety

Priority order for every decision: **player physical safety → privacy → integrity → convenience.**
Requirement IDs (SAFE-n, PRIV-n, AUTH-n, CONTENT-n, ABUSE-n) are referenced from code and migrations.

## 1. Threat model (summary)

| Actor | Goal | Primary controls |
|---|---|---|
| Curious/abusive player | Find other players' real-time locations | PRIV-1/3: no precise location ever leaves the server; coarse cells to party only, opt-in |
| Stalker via party codes | Join strangers' parties | Short-lived, expiring, uniform-error codes; rate limits; leader kick; reports |
| Cheater | Fake GPS to finish quests | Server-side verification, plausibility, dwell, site codes; low reward value |
| Scraper | Read quest locations/answers | RLS reveal policy; code hashes in `private` schema |
| Compromised client bundle | Escalate to service role | Service-role key only on realtime/jobs; bundle grep in CI |
| Malicious WS client | Flood, malformed frames | Zod validation per message, per-type rate limits, payload caps |
| Content author error | Ship a real person/business/story by accident | CONTENT-1 DB guard, review gate |

## 2. Player safety (SAFE) — Saddar-specific design

- **SAFE-1** Every location must be a **public space** (`locations.is_public_space` CHECK). No private premises, no requirement to enter any business, no trespass.
- **SAFE-2** Quests carry `daylight_only` (default true). The client refuses to *start* a daylight-only quest outside local daylight window and warns during one. Window is computed from sunrise/sunset for the pilot coordinates (OQ-2).
- **SAFE-3** No step ever requires crossing hazardous infrastructure; authoring checklist requires a site walk-through sign-off by a human reviewer who is physically familiar with the area (recorded as `reviewed_by`/`reviewed_at`).
- **SAFE-4** Pre-run safety card: stay aware of traffic, don't play while crossing roads, play in a group where possible, how to stop (`run.abandon`) and how to reach local emergency services (numbers to be confirmed with a local advisor — OQ-3, not invented here).
- **SAFE-5** In-app **Report** on every screen of a run/party (`reports` table, write-only inbox).
- **SAFE-6** No chat in v1 (moderation burden, harassment risk). Party communication = preset emotes only.
- **SAFE-7** A "pause & hide me" control: stops sending fixes immediately, clears coarse sharing.

## 3. Privacy (PRIV)

- **PRIV-1** Raw coordinates travel client→server over TLS only, are processed in memory, and are **never rebroadcast, logged, or stored**.
- **PRIV-2** `verification_attempts` stores outcome, distance *band*, accuracy, flags — no lat/lng. Retained 30 days.
- **PRIV-3** Party members may see each other as a **grid cell** (`CoarseCell`, ~150 m, fixed server-side, jittered per room) — only if both the sharer opted in (`profiles.share_coarse_location`, default **false**) and a `party_location_sharing` consent is on record. Never to non-party users. Never historical.
- **PRIV-4** Consent ledger (`consent_records`, append-only): terms, privacy, foreground location, party sharing, analytics. Location permission is requested **just-in-time** with an explanation screen, foreground only; no background location, ever.
- **PRIV-5** Data minimisation: no phone number, real name, contacts, photos or precise device identifiers collected. Email only if the guest upgrades.
- **PRIV-6** Right to delete: self-serve account deletion cascades all user rows. Guests auto-purge after 30 days inactivity.
- **PRIV-7** Analytics (if any) off by default, no location, no join codes, IDs hashed; consent-gated.
- **PRIV-8** Age: the minimum age and any parental-consent flow are a **legal decision** (OQ-1). Until resolved, ship as 18+ only in staging and do not target minors. No data is collected that would be incompatible with a later under-18 tightening.

## 4. Authentication & session security (AUTH)

- **AUTH-1** Supabase Auth only. Anonymous sign-in protected by Cloudflare Turnstile and Supabase rate limits.
- **AUTH-2** Access tokens ≤ 1 h; refresh rotation on; reuse detection on.
- **AUTH-3** Colyseus `onAuth` verifies JWT via JWKS (`jose`), checks `exp`, `aud`, `iss`; rejects missing/mismatched `protocol`. Room join additionally checks DB membership of `partyId` (service role read) — a valid JWT alone is not enough.
- **AUTH-4** Cookies (if SSR session cookies are used) `HttpOnly; Secure; SameSite=Lax`. CSRF: state-changing route handlers require same-origin + a custom header; server actions use Next's built-in checks.
- **AUTH-5** No secrets in `NEXT_PUBLIC_*`. Only the Supabase URL + anon key + public hosts are public.

## 5. Row-Level Security model

RLS is enabled on **every** table in `public` and `private`. Grants start from `REVOKE ALL` then add the minimum (see migration). Clients cannot INSERT/UPDATE/DELETE game state at all.

| Table | Client can | Policy |
|---|---|---|
| `profiles` | select own + live party-mates; update `display_name, avatar_key, share_coarse_location` of own row | `user_id = auth.uid() OR private.shares_party_with(user_id)`; column-level UPDATE grant |
| `consent_records` | select/insert own (append-only) | `user_id = auth.uid()`; no update/delete grant |
| `districts` | select active | `active` |
| `locations` | select if active **and revealed** | `private.location_revealed(id)`: `reveal='always'` OR location is the target of a step that is available/verifying/completed in an active run you belong to |
| `quests`, `quest_steps`, `stamps` | select if visible | `private.quest_visible(status)`: `published`, or `playtest` only when `private.app_flags.allow_playtest_content` is true |
| `parties`, `party_members` | select if member | `private.is_party_member(party_id)`; writes **only** via `create_party/join_party/leave_party` RPCs (security definer) or service role |
| `quest_runs`, `quest_run_members`, `quest_run_steps` | select if run member | `private.is_run_member(run_id)`; writes service role only |
| `verification_attempts`, `user_stamps` | select own | `user_id = auth.uid()` |
| `reports` | insert own (status `open`), select own | `reporter_id = auth.uid()` |
| `audit_log`, `private.*` | nothing | RLS on, no policies, no grants |

Implementation notes (all in the migration):
- Helper functions live in the un-exposed `private` schema, are `SECURITY DEFINER` with `search_path = ''`, and wrap `auth.uid()` in `(select …)` so the planner caches it.
- RPCs use uniform errors (`cannot join`) to prevent code probing; `join_party` locks the row (`FOR UPDATE`) to prevent over-filling races.
- **Guests** hold the `authenticated` role with `is_anonymous=true` (`private.is_anonymous()`); they can play and join parties. Restrictive policies are added per feature where a guest must be limited (e.g. future public leaderboards, content submission). A guest-vs-member test case is part of the pgTAP suite.
- `supabase/tests/rls_smoke.sql` encodes the cross-user isolation assertions; M1 converts it to pgTAP and runs in CI on every migration.
- **Service role** (realtime server, jobs) bypasses RLS → all its writes go through `packages/db/server` functions that take typed arguments, check preconditions explicitly, and write `audit_log` for moderation-relevant actions. No raw SQL strings built from client input anywhere.

## 6. Application hardening (ABUSE)

- **ABUSE-1** Every WS message validated with Zod (`C2S`) before any logic; unknown `type` → drop + strike. Max frame 4 KB. 3 strikes in 60 s → disconnect.
- **ABUSE-2** Rate limits: per-message table in `contracts/realtime.ts` (`C2S_RATE_LIMITS`); join-code attempts: 5 / 10 min per user and per IP at the edge, exponential backoff.
- **ABUSE-3** Idempotency: verification requests carry `(runId, stepId)`; server serialises per run (one in-flight verify per step) so double-taps can't double-advance.
- **ABUSE-4** Site-code brute force: ≤ `maxAttempts` per user/step then lockout; codes ≥ 4 chars from a non-guessable alphabet; stored salted+hashed.
- **ABUSE-5** Security headers on web: strict CSP (self + Supabase + tile host + wss), `frame-ancestors 'none'`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: geolocation=(self), camera=(), microphone=()`.
- **ABUSE-6** CORS on realtime: allow-list of web origins only. WS origin check on upgrade.
- **ABUSE-7** Dependency hygiene: lockfile committed, `pnpm audit` + Dependabot in CI, `pnpm install --frozen-lockfile`, no postinstall scripts allowed except an allow-list.
- **ABUSE-8** Secrets: only in host secret stores; `.env.example` contains names only; secret-scanning on push.

## 7. Content integrity (CONTENT)

- **CONTENT-1** All initial content is fictional and `provenance = 'placeholder'`. DB constraint `quests_placeholder_never_published` makes it **impossible to publish** placeholder quests; production keeps `allow_playtest_content=false`, so placeholder content is not even readable there.
- **CONTENT-2** Placeholder titles/bodies are explicitly labelled (`[PLACEHOLDER]` prefix enforced by the content linter in CI) and must not contain real business names, real people, real addresses or real stories.
- **CONTENT-3** Going to `reviewed` requires `reviewed_by`, `reviewed_at`, and a safety walk-through (SAFE-3); the CHECK `quests_published_reviewed` enforces the DB side.
- **CONTENT-4** Placeholder coordinates in `content/placeholder/*.json` are synthetic test points flagged for replacement; they are not claims about real venues.

## 8. Retention

| Data | Retention |
|---|---|
| Raw GPS fixes | memory only, discarded after the verification decision / 60 s plausibility window |
| `verification_attempts` | 30 days (`private.purge_expired`) |
| Guest accounts | deleted after 30 days of inactivity |
| Expired party codes / parties | disbanded after expiry; membership rows deleted with party |
| `reports` | 12 months, then anonymised (subject refs nulled) |
| `audit_log` | 12 months |

## 9. Security test plan
pgTAP RLS suite (per table × {owner, party-mate, outsider, guest, anon}); contract fuzzing of `C2S` schemas; Playwright tests for permission-denied geolocation, token-expiry reconnect, and party-code probing; bundle scan for service-role key; ZAP baseline against staging before any public pilot.
