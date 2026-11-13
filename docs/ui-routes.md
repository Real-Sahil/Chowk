# Chowk — UI & Route Inventory

Mobile-first (design target 360×640 CSS px, thumb-reachable primary actions, ≥ 44 px targets). English + Urdu (RTL) from day one.
Stack: Next.js App Router, Tailwind, shadcn/ui (in `packages/ui`), Zustand for client-ephemeral state, MapLibre (`packages/map`), R3F (`packages/scene3d`).
Milestone column maps to [`implementation-plan.md`](./implementation-plan.md).

## 1. Routes (App Router)

| Route | Type | Auth | Purpose | M |
|---|---|---|---|---|
| `/` | RSC | any | Splash/redirect: → `/welcome` (no session) or `/map` | M0 |
| `/welcome` | RSC+client | none | Pitch, language toggle, Terms/Privacy links, **Play as guest** / **Sign in** | M1 |
| `/consent` | client | session | Terms + Privacy acceptance (ledger), shown once per policy version | M1 |
| `/auth/sign-in`, `/auth/callback`, `/auth/upgrade` | mixed | any / guest | Email magic link sign-in; guest→member upgrade (same uid) | M1 |
| `/onboarding/safety` | client | session | Safety card (SAFE-4), daylight note, group-play advice; required before first run | M2 |
| `/onboarding/location` | client | session | Just-in-time location rationale → browser permission; denied-state fallback | M2 |
| `/map` | client (dynamic map) | session | Home: map, current district, available quests, quest pins, my-position marker | M2 |
| `/quests` | RSC | session | Quest list (filter: solo/party, duration, daylight) | M2 |
| `/quests/[slug]` | RSC | session | Quest detail: blurb, safety metadata, **PLACEHOLDER** badge, party-size, start/host buttons | M2 |
| `/run/[runId]` | client | run member | Active run HUD: current step card, mini-map, verify button, emotes, abandon | M4 |
| `/run/[runId]/step/[stepId]` | client | run member | Step detail + verification UI (geofence / code entry / sync waiting) | M4 |
| `/run/[runId]/complete` | client | run member | Completion + stamps (R3F reveal, lazy) | M5 |
| `/party/new` | client | session | Create party (size) | M3 |
| `/party/join` | client | session | Enter 6-char code | M3 |
| `/party/[partyId]` | client | party member | Lobby: roster, ready toggles, code share, kick, start run | M3 |
| `/stamps` | RSC | session | Collection grid (R3F viewer on tap) | M5 |
| `/profile` | RSC+client | session | Display name, avatar, guest banner with upgrade CTA | M1 |
| `/settings` | client | session | Language, location sharing toggle (PRIV-3), reduced motion, data saver | M2 |
| `/settings/privacy` | client | session | Consent ledger view/revoke, **Delete my account**, export | M1 |
| `/report` (sheet, also modal in-run) | client | session | Report unsafe location / person / content / cheating | M3 |
| `/legal/terms`, `/legal/privacy`, `/legal/safety` | RSC static | none | Policy pages (text pending counsel — OQ-1) | M1 |
| `/offline` | static | none | PWA offline fallback | M0 |
| `/not-found`, `/error` | RSC | none | Error boundaries (no stack traces) | M0 |
| `/admin/*` | RSC | staff role | Content review queue, report triage, manual verification review (out of pilot player app; separate role + MFA) | M6 |

### Route handlers (`app/api`)
| Endpoint | Method | Purpose |
|---|---|---|
| `/api/account` | DELETE | Delete account (Better Auth + DB cascade + storage cleanup) |
| `/api/account/export` | GET | JSON export of own rows |
| `/api/consent` | POST | Append consent record (`RecordConsentInput`) |
| `/api/parties/join` | POST | Rate-limited wrapper around the `join_party` SQL function |
| `/api/realtime/ticket` | POST | Mint short-lived signed realtime join ticket |
| `/api/runs/[id]/steps/[id]/verify` | POST | Server-side GPS/QR/photo verification |
| `/api/internal/maintenance` | POST | Secret-protected retention sweep (free scheduler) |
| `/api/health` | GET | Liveness |

## 2. Screen/component inventory

**Shell:** `AppShell` (safe-area insets, bottom tab bar: Map · Quests · Party · Stamps · Me), `TopBar`, `LocaleSwitch`, `OfflineBanner`, `GuestBanner`, `ErrorBoundary`, `Toaster`.

**Map (`packages/map`):** `MapView` (lazy), `PlayerMarker`, `QuestPin`, `DistrictOutline`, `TargetRing` (radius visual; never exact target until revealed), `RecenterButton`, `GpsStatusChip` (accuracy, permission state), `TilesAttribution`.

**Quest:** `QuestCard`, `QuestDetailSheet`, `SafetyChips` (daylight, group size), `PlaceholderBadge`, `StepCard`, `StepProgress`, `VerifyButton` (states: idle, locating, verifying, rejected-with-band-hint, accepted), `SiteCodeInput` (OTP-style), `PartySyncMeter`.

**Party:** `PartyRoster`, `MemberRow` (name, ready, connected, kick), `JoinCodeCard` (copy/share, expiry countdown), `ReadyToggle`, `EmoteBar` (5 presets), `CoarseCellHint` ("near you / nearby / far" — no map dot), `LeaveDialog`.

**Safety/consent:** `ConsentGate`, `LocationRationale`, `SafetyCard`, `ReportSheet`, `PauseSharingFab`.

**3D (`packages/scene3d`, lazy, `prefers-reduced-motion` aware, DPR capped at 2, ≤ 100 k tris):** `StampReveal`, `StampViewer`, `LoadingGlyph` (optional).

**System states each screen must handle:** loading skeleton, empty, offline, permission-denied (location), GPS-poor, rate-limited, reconnecting (realtime), version-mismatch (force refresh), session-expired.

## 3. Client state (Zustand stores)
| Store | Holds | Persisted |
|---|---|---|
| `useSessionStore` | auth session snapshot, isGuest | no (HttpOnly cookie is the source of truth) |
| `useMapStore` | viewport, follow-mode | no |
| `useRoomStore` | Colyseus connection status, party snapshot, member cells | no |
| `useRunStore` | active run view, verification UI state | no |
| `useGeoStore` | permission state, last fix (memory only), accuracy | **never** |
| `usePrefsStore` | locale, reduced motion, data saver | localStorage (non-sensitive) |

## 4. Navigation rules
- Unauthenticated → `/welcome`. Authenticated but missing consent → `/consent`. Missing safety/location onboarding → respective step before `/run/*`.
- `/run/*` and `/party/*` guard on server membership (RLS read), not client state.
- Leaving an active run requires confirmation; the browser back button never abandons a run.

## 5. Accessibility & i18n
WCAG 2.2 AA targets; focus-visible, screen-reader labels on map controls, text alternatives for pins; no information by colour alone; `lang`/`dir` set per locale; ICU message format via `next-intl` (decision M0); Urdu font subset budget ≤ 80 KB.
