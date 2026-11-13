import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import pg from "pg";
import { badges, places, quests } from "./saddar-placeholder.js";

/**
 * Idempotent seed. Runs as the OWNER role over the DIRECT endpoint (writes content tables chowk_app cannot write).
 * Quests are seeded as provenance='placeholder', status='playtest' - the DB forbids publishing them, and the
 * runtime hides them unless app.flags.allow_playtest_content is true (never in production).
 * QR secrets are random per step; only their sha256 is stored. Plaintext goes to .data/dev-qr-secrets.json (gitignored).
 */
export async function runSeed(url: string, opts: { secretsFile?: string } = {}): Promise<{ quests: number; steps: number; places: number }> {
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  const c = await pool.connect();
  const secrets: Record<string, string> = {};
  try {
    await c.query("begin");
    const placeId: Record<string, string> = {};
    for (const p of places) {
      const r = await c.query(
        `insert into places(slug,name,kind,district,lat,lng,geofence_radius_m,opening_hours,accessibility_notes,safety_notes,is_synthetic,provenance)
         values ($1,$2,$3,'[PLACEHOLDER] Saddar (pilot area label)',$4,$5,$6,$7,$8,$9,true,'placeholder')
         on conflict (slug) do update set name=excluded.name, lat=excluded.lat, lng=excluded.lng, geofence_radius_m=excluded.geofence_radius_m,
           opening_hours=excluded.opening_hours, accessibility_notes=excluded.accessibility_notes, safety_notes=excluded.safety_notes returning id`,
        [p.slug, p.name, p.kind, p.lat, p.lng, p.radius, JSON.stringify(p.hours ?? {}), p.access, p.safety],
      );
      placeId[p.slug] = r.rows[0].id;
    }
    const badgeId: Record<string, string> = {};
    for (const b of badges) {
      const r = await c.query(
        `insert into badges(slug,name,description,scope,art_key,provenance) values ($1,$2,$3,$4,$5,'placeholder')
         on conflict (slug) do update set name=excluded.name, description=excluded.description returning id`,
        [b.slug, b.name, b.description, b.scope, b.art],
      );
      badgeId[b.slug] = r.rows[0].id;
    }
    let steps = 0;
    for (const q of quests) {
      const r = await c.query(
        `insert into quests(slug,title,summary,difficulty,estimated_minutes,reward_xp,reward_badge_id,min_party_size,max_party_size,daylight_only,window_start,window_end,provenance,status)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'placeholder','playtest')
         on conflict (slug) do update set title=excluded.title, summary=excluded.summary, difficulty=excluded.difficulty, estimated_minutes=excluded.estimated_minutes,
           reward_xp=excluded.reward_xp, reward_badge_id=excluded.reward_badge_id, min_party_size=excluded.min_party_size, max_party_size=excluded.max_party_size,
           daylight_only=excluded.daylight_only, window_start=excluded.window_start, window_end=excluded.window_end returning id`,
        [q.slug, q.title, q.summary, q.difficulty, q.minutes, q.xp, badgeId[q.badgeSlug], q.min, q.max, q.daylightOnly, q.window?.[0] ?? null, q.window?.[1] ?? null],
      );
      const qid = r.rows[0].id as string;
      for (const s of q.steps) {
        const sr = await c.query(
          `insert into quest_steps(quest_id,ordinal,place_id,title,clue,story_unlock,verification_method,config) values ($1,$2,$3,$4,$5,$6,$7,$8)
           on conflict (quest_id, ordinal) do update set place_id=excluded.place_id, title=excluded.title, clue=excluded.clue,
             story_unlock=excluded.story_unlock, verification_method=excluded.verification_method, config=excluded.config returning id`,
          [qid, s.ordinal, s.placeSlug ? placeId[s.placeSlug] : null, s.title, s.clue, s.story, s.method, JSON.stringify(s.config ?? {})],
        );
        steps++;
        if (s.method === "qr") {
          const exists = await c.query(`select 1 from quest_step_secrets where step_id=$1`, [sr.rows[0].id]);
          if (exists.rowCount === 0) {
            const secret = randomBytes(24).toString("base64url");
            secrets[`${q.slug}#${s.ordinal}`] = secret;
            await c.query(`insert into quest_step_secrets(step_id, qr_secret_hash) values ($1,$2)`, [sr.rows[0].id, createHash("sha256").update(secret).digest("hex")]);
          }
        }
      }
    }
    await c.query("commit");
    if (opts.secretsFile && Object.keys(secrets).length) {
      await mkdir(opts.secretsFile.replace(/[^/]+$/, ""), { recursive: true });
      await writeFile(opts.secretsFile, JSON.stringify(secrets, null, 2), { mode: 0o600 });
    }
    return { quests: quests.length, steps, places: places.length };
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
    await pool.end();
  }
}
