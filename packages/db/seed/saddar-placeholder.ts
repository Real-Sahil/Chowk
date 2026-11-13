/**
 * FICTIONAL PLACEHOLDER CONTENT. Every business, person, place and story here is invented to exercise the engine.
 * - Names/titles/bodies are prefixed "[PLACEHOLDER]" (enforced by the seed test).
 * - Coordinates are SYNTHETIC points near 0°N 0°E (open ocean): they are not claims about any real location and
 *   must never be shown to players as real destinations. Development uses mocked GPS at these points.
 * - "Saddar" appears only as the pilot area label, never as an address.
 */
export type Method = "gps" | "qr" | "photo" | "narrative";

export interface SeedPlace { slug: string; name: string; kind: "food" | "maker" | "market" | "landmark" | "square"; lat: number; lng: number; radius: number; hours?: Record<string, string[][]>; access: string; safety: string }
export interface SeedStep { ordinal: number; placeSlug: string | null; title: string; clue: string; story: string; method: Method; config?: Record<string, unknown> }
export interface SeedQuest {
  slug: string; title: string; summary: string; difficulty: "easy" | "medium" | "hard"; minutes: number; xp: number;
  badgeSlug: string; min: number; max: number; daylightOnly: boolean; window?: [string, string]; steps: SeedStep[];
}

const D = "[PLACEHOLDER] Saddar (pilot area label)";
const P = (slug: string, name: string, kind: SeedPlace["kind"], i: number, extra: Partial<SeedPlace> = {}): SeedPlace => ({
  slug, name: `[PLACEHOLDER] ${name}`, kind,
  // synthetic grid ~100 m apart around (0,0)
  lat: 0.0005 * Math.floor(i / 4), lng: 0.0005 * (i % 4),
  radius: 40,
  access: "[PLACEHOLDER] Step-free access assumed for testing; real notes to be written by a local reviewer.",
  safety: "[PLACEHOLDER] Public space; stay aware of traffic. Real safety notes to be written by a local reviewer.",
  ...extra,
});

export const places: SeedPlace[] = [
  P("ph-chai-stall-a", "Chai Stall A (fictional)", "food", 0),
  P("ph-street-food-corner", "Street Food Corner (fictional)", "food", 1),
  P("ph-market-lane", "Market Lane (fictional)", "market", 2),
  P("ph-tea-square", "Tea Square (fictional)", "square", 3, { radius: 60 }),
  P("ph-tailor-row", "Tailor Row (fictional)", "maker", 4),
  P("ph-repair-yard", "Repair Yard (fictional)", "maker", 5),
  P("ph-craft-arcade", "Craft Arcade (fictional)", "maker", 6),
  P("ph-design-court", "Design Court (fictional)", "maker", 7),
  P("ph-maker-square", "Maker Square (fictional)", "square", 8, { radius: 60 }),
  P("ph-night-stage", "Night Stage (fictional)", "market", 9, { hours: { all: [["18:00", "23:00"]] } }),
  P("ph-lantern-food-row", "Lantern Food Row (fictional)", "food", 10, { hours: { all: [["18:00", "23:00"]] } }),
  P("ph-night-bazaar", "Night Bazaar (fictional)", "market", 11, { hours: { all: [["18:00", "23:00"]] } }),
];

export const badges = [
  { slug: "ph-badge-chai-circuit", name: "[PLACEHOLDER] Chai Circuit", description: "[PLACEHOLDER] Completed the fictional Chai Circuit trail.", scope: "individual" as const, art: "chai" },
  { slug: "ph-badge-saddar-maker", name: "[PLACEHOLDER] Saddar Maker", description: "[PLACEHOLDER] Completed the fictional Makers of Saddar trail.", scope: "individual" as const, art: "maker" },
  { slug: "ph-badge-night-market", name: "[PLACEHOLDER] Night Market", description: "[PLACEHOLDER] Completed the fictional Night Market trail.", scope: "individual" as const, art: "night" },
  { slug: "ph-badge-party-explorers", name: "[PLACEHOLDER] Party Explorers", description: "[PLACEHOLDER] Shared badge for finishing any trail together as a party.", scope: "party" as const, art: "party" },
];

export const quests: SeedQuest[] = [
  {
    slug: "ph-the-chai-circuit", title: "[PLACEHOLDER] The Chai Circuit",
    summary: "[PLACEHOLDER] A fictional four-stop trail about chai, street food and local commerce. Not a real route.",
    difficulty: "easy", minutes: 45, xp: 150, badgeSlug: "ph-badge-chai-circuit", min: 1, max: 6, daylightOnly: true,
    steps: [
      { ordinal: 0, placeSlug: "ph-chai-stall-a", method: "qr", title: "[PLACEHOLDER] Scan the kettle sign", clue: "[PLACEHOLDER] Find the fictional sign beside the steaming kettle and scan its code.", story: "[PLACEHOLDER] Story fragment 1: a fictional vendor explains why the water must boil twice.", config: { qrTtlSeconds: 900 } },
      { ordinal: 1, placeSlug: "ph-street-food-corner", method: "gps", title: "[PLACEHOLDER] Reach the corner", clue: "[PLACEHOLDER] Follow the smell of frying to the fictional corner and check in.", story: "[PLACEHOLDER] Story fragment 2: the corner has an imaginary rivalry with Market Lane.", config: { minDwellSec: 10 } },
      { ordinal: 2, placeSlug: "ph-market-lane", method: "photo", title: "[PLACEHOLDER] Photograph the colours", clue: "[PLACEHOLDER] Photograph something red and something green in the fictional lane. No faces.", story: "[PLACEHOLDER] Story fragment 3: colour as a language between invented traders.", config: { instructions: "No people's faces; no private property interiors." } },
      { ordinal: 3, placeSlug: "ph-tea-square", method: "gps", title: "[PLACEHOLDER] The last cup", clue: "[PLACEHOLDER] Gather at the fictional square to unlock the ending.", story: "[PLACEHOLDER] Story unlock: the fictional Last Cup legend, written only to test story reveal.", config: { minDwellSec: 10 } },
    ],
  },
  {
    slug: "ph-makers-of-saddar", title: "[PLACEHOLDER] Makers of Saddar",
    summary: "[PLACEHOLDER] A fictional five-stop trail about tailors, repairers, craftspeople and designers. All people are invented.",
    difficulty: "medium", minutes: 70, xp: 250, badgeSlug: "ph-badge-saddar-maker", min: 1, max: 6, daylightOnly: true,
    steps: [
      { ordinal: 0, placeSlug: "ph-tailor-row", method: "gps", title: "[PLACEHOLDER] Tailor Row", clue: "[PLACEHOLDER] Find the fictional row where imaginary needles never stop.", story: "[PLACEHOLDER] Fragment 1: a made-up tailor, Character A, counts stitches as a lullaby.", config: { minDwellSec: 10 } },
      { ordinal: 1, placeSlug: "ph-repair-yard", method: "qr", title: "[PLACEHOLDER] Repair Yard", clue: "[PLACEHOLDER] Scan the code on the fictional repair-yard board.", story: "[PLACEHOLDER] Fragment 2: nothing is thrown away in this invented yard.", config: { qrTtlSeconds: 900 } },
      { ordinal: 2, placeSlug: "ph-craft-arcade", method: "photo", title: "[PLACEHOLDER] A made thing", clue: "[PLACEHOLDER] Photograph a handmade object in a public area. Ask permission before photographing anyone's work.", story: "[PLACEHOLDER] Fragment 3: hands, tools, patience (all fictional).", config: { instructions: "Photograph objects only; ask permission; no faces." } },
      { ordinal: 3, placeSlug: "ph-design-court", method: "gps", title: "[PLACEHOLDER] Design Court", clue: "[PLACEHOLDER] Reach the fictional court where invented designers sketch.", story: "[PLACEHOLDER] Fragment 4: a pattern that exists only in this test.", config: { minDwellSec: 10 } },
      { ordinal: 4, placeSlug: null, method: "narrative", title: "[PLACEHOLDER] Character story: the Placeholder Maker", clue: "[PLACEHOLDER] Read the story of an invented maker.", story: "[PLACEHOLDER] Character story: 'Character A' is a fictional composite used for testing. No real person is depicted.", config: {} },
    ],
  },
  {
    slug: "ph-the-night-market", title: "[PLACEHOLDER] The Night Market",
    summary: "[PLACEHOLDER] A fictional three-stop evening trail about food, music and markets. Available only in the evening window.",
    difficulty: "medium", minutes: 50, xp: 200, badgeSlug: "ph-badge-night-market", min: 2, max: 6, daylightOnly: false, window: ["18:00", "23:00"],
    steps: [
      { ordinal: 0, placeSlug: "ph-night-stage", method: "gps", title: "[PLACEHOLDER] Find the music", clue: "[PLACEHOLDER] Follow the invented rhythm to the fictional stage.", story: "[PLACEHOLDER] Fragment 1: the band exists only in this test fixture.", config: { minDwellSec: 10 } },
      { ordinal: 1, placeSlug: "ph-lantern-food-row", method: "qr", title: "[PLACEHOLDER] Lantern Food Row", clue: "[PLACEHOLDER] Scan the code beneath the fictional lantern.", story: "[PLACEHOLDER] Fragment 2: lanterns stand in for streetlights in this story.", config: { qrTtlSeconds: 900 } },
      { ordinal: 2, placeSlug: "ph-night-bazaar", method: "photo", title: "[PLACEHOLDER] Night lights", clue: "[PLACEHOLDER] Photograph the glow of the fictional bazaar. No faces; stay with your group.", story: "[PLACEHOLDER] Ending: the Night Market closes, as all fictional markets do.", config: { instructions: "No faces; keep to well-lit public areas; stay with your group." } },
    ],
  },
];
