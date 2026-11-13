import { afterAll, describe, expect, it } from "vitest";
import pg from "pg";
import { sql } from "drizzle-orm";
import { UserId } from "@chowk/contracts";
import { createNodeAdapter, loadDbEnv } from "../src/index.js";
import { runSeed } from "../seed/run-seed.js";
import { places, quests, badges } from "../seed/saddar-placeholder.js";

const OWNER = process.env.TEST_OWNER_URL!, APP = process.env.DATABASE_URL!;
const owner = new pg.Pool({ connectionString: OWNER, max: 2 });
const app = await createNodeAdapter({ env: loadDbEnv({ DATABASE_URL: APP, APP_ENV: "test" }) });
afterAll(async () => { await owner.end(); await app.close(); });
const n = async (q: string) => Number((await owner.query(q)).rows[0].n);

describe("Saddar placeholder seed (real database)", () => {
  it("seeds the three trails with 4 / 5 / 3 steps and is idempotent", async () => {
    const first = await runSeed(OWNER);
    expect(first).toEqual({ quests: 3, steps: 12, places: 12 });
    await runSeed(OWNER);
    expect(await n(`select count(*)::int n from quests where slug like 'ph-%'`)).toBe(3);
    const counts = (await owner.query(`select q.slug, count(*)::int c from quests q join quest_steps s on s.quest_id=q.id where q.slug like 'ph-%' group by 1 order by 1`)).rows;
    expect(Object.fromEntries(counts.map((r) => [r.slug, r.c]))).toEqual({ "ph-makers-of-saddar": 5, "ph-the-chai-circuit": 4, "ph-the-night-market": 3 });
    expect(await n(`select count(*)::int n from quest_step_secrets ss join quest_steps st on st.id=ss.step_id join quests q on q.id=st.quest_id where q.slug like 'ph-%'`)).toBe(quests.flatMap((q) => q.steps).filter((s) => s.method === "qr").length);
  });
  it("EVERY name, title, clue and story is marked PLACEHOLDER; coordinates are synthetic", async () => {
    for (const p of places) { expect(p.name).toMatch(/^\[PLACEHOLDER\]/); expect(p.access).toMatch(/PLACEHOLDER/); expect(p.safety).toMatch(/PLACEHOLDER/); expect(Math.abs(p.lat)).toBeLessThan(0.01); expect(Math.abs(p.lng)).toBeLessThan(0.01); }
    for (const b of badges) { expect(b.name).toMatch(/^\[PLACEHOLDER\]/); expect(b.description).toMatch(/PLACEHOLDER/); }
    for (const q of quests) { expect(q.title).toMatch(/^\[PLACEHOLDER\]/); expect(q.summary).toMatch(/PLACEHOLDER/); for (const s of q.steps) { expect(s.title).toMatch(/^\[PLACEHOLDER\]/); expect(s.clue).toMatch(/PLACEHOLDER/); expect(s.story).toMatch(/PLACEHOLDER/); } }
    expect(await n(`select count(*)::int n from places where not is_synthetic or provenance <> 'placeholder'`)).toBe(0);
    expect(await n(`select count(*)::int n from quests where provenance <> 'placeholder' or status = 'published'`)).toBe(0);
  });
  it("trail requirements: method mix, Night Market window, badges linked", async () => {
    const m = (slug: string) => quests.find((q) => q.slug === slug)!.steps.map((s) => s.method);
    expect(m("ph-the-chai-circuit")).toEqual(["qr", "gps", "photo", "gps"]);
    expect(m("ph-makers-of-saddar")).toContain("narrative");
    expect(m("ph-the-night-market")).toContain("photo");
    const nm = (await owner.query(`select window_start::text ws, window_end::text we, daylight_only from quests where slug='ph-the-night-market'`)).rows[0];
    expect(nm).toEqual({ ws: "18:00:00", we: "23:00:00", daylight_only: false });
    expect(await n(`select count(*)::int n from quests where slug like 'ph-%' and reward_badge_id is null`)).toBe(0);
  });
  it("runtime role cannot see placeholder content while the playtest flag is off (production default)", async () => {
    const u = UserId.parse("aaaaaaaa-0000-4000-8000-000000000001");
    await owner.query(`insert into auth."user"(id,name,email) values ($1,'seeduser','seeduser@example.test') on conflict do nothing`, [u]);
    const count = async () => ((await app.withActor({ kind: "user", userId: u }, (t) => t.execute(sql`select count(*)::int n from quests where slug like 'ph-%'`))) as { rows: { n: number }[] }).rows[0]!.n;
    expect(await count()).toBe(0);
    await owner.query(`update app.flags set value=true where key='allow_playtest_content'`);
    expect(await count()).toBe(3);
    await owner.query(`update app.flags set value=false where key='allow_playtest_content'`);
  });
});
