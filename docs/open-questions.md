# Chowk — Open Questions & Assumptions

**The full product specification was not available** to this architecture pass (not in the conversation, not in the repo, which held only a one-line README). Everything below is an assumption made from the brief. Reconcile with the real spec before M1; items marked 🔴 can change the architecture.

## Assumptions made
| # | Assumption | Source |
|---|---|---|
| A1 | Mobile **web/PWA**, not native apps | Stack list (Next.js, no React Native) |
| A2 | Parties are 2–6 players, joined by short code; no friends graph | "party management" |
| A3 | Quests are ordered multi-step sequences; one active step at a time | "quest progression" |
| A4 | "Verification" = proving physical presence at public places (GPS + on-site code) | "verification flows" |
| A5 | No player-to-player chat, no payments, no leaderboards in v1 | Safety/privacy-first priority |
| A6 | Guests are real (anonymous) accounts that can later upgrade by email | "guest sessions" |
| A7 | Solo play is supported (min party size 1) | assumption |
| A8 | Stamps (collectibles) are the reward unit and the R3F showcase | R3F in stack, no other 3D use specified |

## Open questions
| ID | Question | Why it matters | Owner |
|---|---|---|---|
| OQ-1 🔴 | Minimum age and parental-consent requirement? Applicable Pakistani data-protection / online-safety law? | Data model, consent flow, store policies | Founder + counsel |
| OQ-2 | Pilot map centre/bounding box and daylight window source | Daylight gate, tile caching, env config (deliberately not hard-coded) | Founder |
| OQ-3 | Emergency numbers / safety guidance wording for the safety card | SAFE-4; must be verified by a local advisor, not invented | Local advisor |
| OQ-4 | Hosting region for Supabase/realtime relative to Karachi latency & data residency | Latency, compliance | Founder/engineering |
| OQ-5 | Guest abuse tolerance: Turnstile only, or also phone/OTP for party creation? | Stalking/abuse risk vs friction | Product |
| OQ-6 🔴 | Is there a competitive/economic layer (prizes, partner businesses, sponsorship)? | Raises cheating stakes → stronger verification; partner content needs contracts | Product |
| OQ-7 🔴 | Map tile provider and licensing (pilot area, offline caching, cost) | MapLibre needs a tile source | Engineering |
| OQ-8 | Languages: English + Urdu confirmed? Sindhi? | RTL/i18n scope | Product |
| OQ-9 | Real quest content authors and review process (who signs `reviewed_by`?) | M7 gate | Founder |
| OQ-10 | Is native wrapper (Capacitor) acceptable if PWA background limits hurt? | Foreground-only design assumption | Product |
| OQ-11 | Real-time ambient presence (other players nearby, not in your party) wanted? | Currently excluded for safety; big privacy review if yes | Product |
