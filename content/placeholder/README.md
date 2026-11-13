# Placeholder quest content

**Everything in this folder is fictional and explicitly a placeholder.** It exists only to exercise the engine.
It must not be shown to real players in production (`allow_playtest_content=false`; DB CHECK blocks publishing).

Rules (enforced by the content linter, M2):
- `provenance` must be `"placeholder"`; titles and bodies start with `[PLACEHOLDER]`.
- No real businesses, people, addresses, events or stories.
- Coordinates are synthetic test points, **not** claims about real venues, and must be replaced by reviewed data.
- Locations must be public spaces (`isPublicSpace: true`).

The authoritative seed data now lives in `packages/db/seed/saddar-placeholder.ts` (3 trails, 12 steps, 12 places, 4 badges). It is validated by `packages/db/test/seed.test.ts`: every name/title/clue/story must be marked PLACEHOLDER and coordinates must be synthetic (near 0°N 0°E, open ocean).
