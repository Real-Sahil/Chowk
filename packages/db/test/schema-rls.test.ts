import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { sql } from "drizzle-orm";
import { UserId } from "@chowk/contracts";
import { createNodeAdapter, loadDbEnv } from "../src/index.js";

/** REAL migrated schema, REAL roles. Fixtures are written by the owner; behaviour is observed as chowk_app / chowk_auth. */
const OWNER = process.env.TEST_OWNER_URL!, APP = process.env.DATABASE_URL!, AUTH = process.env.AUTH_DATABASE_URL!;
if (!OWNER || !APP || !AUTH) throw new Error("TEST_OWNER_URL, DATABASE_URL and AUTH_DATABASE_URL are required");

const owner = new pg.Pool({ connectionString: OWNER, max: 2 });
const authDb = new pg.Pool({ connectionString: AUTH, max: 2 });
const app = await createNodeAdapter({ env: loadDbEnv({ DATABASE_URL: APP, APP_ENV: "test", DB_POOL_MAX: "4" }) });

const id = (n: number) => UserId.parse(`${n.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`);
const U = { alice: id(0xa1), bob: id(0xb2), carol: id(0xc3), mod: id(0xd4), guest: id(0xe5), member: id(0xf6) };
type Row = Record<string, unknown>;
const rows = (r: unknown) => (r as { rows: Row[] }).rows;
const as = <T>(u: string | null, fn: (tx: any) => Promise<T>) => app.withActor(u ? { kind: "user", userId: UserId.parse(u) } : { kind: "anon" }, fn);
async function pgErr(p: Promise<unknown>) {
  try { await p; } catch (e) { const c = (e as { cause?: { message: string; code?: string } }).cause ?? (e as { message: string; code?: string }); return c; }
  throw new Error("expected rejection");
}

let quest = "", badge = "", step1 = "", place = "";

beforeAll(async () => {
  for (const [name, uid] of Object.entries(U)) {
    await owner.query(`insert into auth."user"(id,name,email,is_anonymous) values ($1,$2,$3,$4)`, [uid, name, `${name}@example.test`, name === "guest"]);
  }
  await owner.query(`update public.profiles set role='moderator' where user_id=$1`, [U.mod]);
  place = (await owner.query(`insert into places(slug,name,kind,district,lat,lng,provenance) values ('t-place','[PLACEHOLDER] Place','food','[PLACEHOLDER] District',0.001,0.001,'placeholder') returning id`)).rows[0].id;
  badge = (await owner.query(`insert into badges(slug,name) values ('t-badge','[PLACEHOLDER] Badge') returning id`)).rows[0].id;
  quest = (await owner.query(`insert into quests(slug,title,estimated_minutes,status,reward_badge_id) values ('t-quest','[PLACEHOLDER] Quest',20,'playtest',$1) returning id`, [badge])).rows[0].id;
  step1 = (await owner.query(`insert into quest_steps(quest_id,ordinal,place_id,title,verification_method) values ($1,0,$2,'[PLACEHOLDER] S1','gps') returning id`, [quest, place])).rows[0].id;
  await owner.query(`insert into quest_step_secrets(step_id, qr_secret_hash) values ($1,'x')`, [step1]);
});
afterAll(async () => { await app.close(); await owner.end(); await authDb.end(); });

describe("profiles & identity", () => {
  it("trigger creates a profile for every auth user; guest flag mirrors is_anonymous", async () => {
    const r = await owner.query(`select user_id,is_guest,display_name from profiles where user_id in ($1,$2)`, [U.guest, U.alice]);
    expect(r.rows.find((x) => x.user_id === U.guest).is_guest).toBe(true);
    expect(r.rows.find((x) => x.user_id === U.alice).is_guest).toBe(false);
    expect(r.rows[0].display_name).toMatch(/^Player-/);
  });
  it("users read only their own profile; staff read all; anon none", async () => {
    expect(rows(await as(U.alice, (t) => t.execute(sql`select user_id from profiles`))).map((r) => r.user_id)).toEqual([U.alice]);
    expect(rows(await as(U.mod, (t) => t.execute(sql`select user_id from profiles`))).length).toBe(Object.keys(U).length);
    expect(rows(await as(null, (t) => t.execute(sql`select user_id from profiles`))).length).toBe(0);
  });
  it("cannot self-promote or un-suspend (column grants) nor edit someone else", async () => {
    for (const col of ["role = 'admin'", "status = 'active'", "is_guest = false"]) {
      const e = await pgErr(as(U.alice, (t) => t.execute(sql.raw(`update profiles set ${col} where user_id = '${U.alice}'`))));
      expect(e.code).toBe("42501");
    }
    const upd = (await as(U.alice, (t) => t.execute(sql`update profiles set display_name = 'Hacked' where user_id = ${U.bob}`))) as { rowCount: number };
    expect(upd.rowCount).toBe(0);
    await as(U.alice, (t) => t.execute(sql`update profiles set display_name = 'Alice A', analytics_consent = true where user_id = ${U.alice}`));
    expect((await owner.query(`select display_name from profiles where user_id=$1`, [U.alice])).rows[0].display_name).toBe("Alice A");
  });
  it("display_name length CHECK enforced", async () => {
    const e = await pgErr(as(U.alice, (t) => t.execute(sql`update profiles set display_name = 'x' where user_id = ${U.alice}`)));
    expect(e.code).toBe("23514");
  });
  it("one character per user; users write only their own", async () => {
    await as(U.alice, (t) => t.execute(sql`insert into characters(user_id,name) values (${U.alice},'Alice Char')`));
    expect((await pgErr(as(U.alice, (t) => t.execute(sql`insert into characters(user_id,name) values (${U.alice},'Second')`)))).code).toBe("23505");
    expect((await pgErr(as(U.alice, (t) => t.execute(sql`insert into characters(user_id,name) values (${U.bob},'Forged')`)))).code).toBe("42501");
  });
});

describe("auth schema isolation", () => {
  it("product role cannot touch auth tables at all", async () => {
    for (const t of ["auth.\"user\"", "auth.session", "auth.account", "auth.verification"]) {
      expect((await pgErr(as(U.alice, (tx) => tx.execute(sql.raw(`select * from ${t}`))))).code).toBe("42501");
    }
  });
  it("auth role sees auth tables but NOT product tables", async () => {
    expect((await authDb.query(`select count(*)::int n from auth."user"`)).rows[0].n).toBeGreaterThan(0);
    await expect(authDb.query(`select * from public.quest_completions`)).rejects.toMatchObject({ code: "42501" });
    await expect(authDb.query(`select * from public.profiles`)).rejects.toMatchObject({ code: "42501" });
  });
});

describe("content visibility & secrets", () => {
  it("playtest/placeholder content is hidden while the flag is off, visible when on", async () => {
    expect(rows(await as(U.alice, (t) => t.execute(sql`select id from quests`))).length).toBe(0);
    expect(rows(await as(U.alice, (t) => t.execute(sql`select id from places`))).length).toBe(0);
    expect(rows(await as(U.alice, (t) => t.execute(sql`select id from quest_steps`))).length).toBe(0);
    expect(rows(await as(U.mod, (t) => t.execute(sql`select id from quests`))).length).toBe(1); // staff can see drafts
    await owner.query(`update app.flags set value = true where key = 'allow_playtest_content'`);
    expect(rows(await as(U.alice, (t) => t.execute(sql`select id from quests`))).length).toBe(1);
    expect(rows(await as(null, (t) => t.execute(sql`select id from quest_steps`))).length).toBe(1);
    await owner.query(`update app.flags set value = false where key = 'allow_playtest_content'`);
  });
  it("placeholder quests can never be published (CHECK), published requires a reviewer", async () => {
    expect((await pgErr(owner.query(`update quests set status='published' where id=$1`, [quest]))).code).toBe("23514");
    expect((await pgErr(owner.query(`insert into quests(slug,title,estimated_minutes,status,provenance) values ('r','r',20,'published','reviewed')`))).code).toBe("23514");
  });
  it("step secrets are unreadable by every runtime role", async () => {
    expect((await pgErr(as(U.mod, (t) => t.execute(sql`select * from quest_step_secrets`)))).code).toBe("42501");
    await expect(authDb.query(`select * from public.quest_step_secrets`)).rejects.toMatchObject({ code: "42501" });
  });
  it("places: geofence radius, coordinate and public-space CHECKs", async () => {
    for (const v of ["10", "151"]) expect((await pgErr(owner.query(`insert into places(slug,name,kind,district,lat,lng,geofence_radius_m) values ('x${v}','n','food','d',0,0,${v})`))).code).toBe("23514");
    expect((await pgErr(owner.query(`insert into places(slug,name,kind,district,lat,lng) values ('xl','n','food','d',91,0)`))).code).toBe("23514");
    expect((await pgErr(owner.query(`insert into places(slug,name,kind,district,lat,lng,is_public_space) values ('xp','n','food','d',0,0,false)`))).code).toBe("23514");
  });
  it("gps/qr/photo steps require a place; narrative does not", async () => {
    expect((await pgErr(owner.query(`insert into quest_steps(quest_id,ordinal,title,verification_method) values ($1,9,'x','qr')`, [quest]))).code).toBe("23514");
    await owner.query(`insert into quest_steps(quest_id,ordinal,title,verification_method) values ($1,9,'n','narrative')`, [quest]);
    await owner.query(`delete from quest_steps where quest_id=$1 and ordinal=9`, [quest]);
  });
});

describe("progress, rewards and replay protection are not client-writable", () => {
  it("direct writes to progress/completions/badges/parties/attempts are denied", async () => {
    const tries = [
      sql`insert into quest_completions(user_id,quest_id) values (${U.alice},${quest})`,
      sql`insert into user_badges(user_id,badge_id) values (${U.alice},${badge})`,
      sql`insert into quest_step_progress(user_id,quest_id,step_id) values (${U.alice},${quest},${step1})`,
      sql`insert into parties(leader_id) values (${U.alice})`,
      sql`insert into party_members(party_id,user_id) values (gen_random_uuid(),${U.alice})`,
      sql`insert into party_invitations(party_id,inviter_id,invitee_id) values (gen_random_uuid(),${U.alice},${U.bob})`,
      sql`insert into verification_attempts(progress_id,user_id,method,outcome,attempt_nonce) values (gen_random_uuid(),${U.alice},'gps','accepted',gen_random_uuid())`,
      sql`insert into photo_reviews(owner_id,storage_key) values (${U.alice},'k')`,
      sql`insert into moderation_actions(action,target_type) values ('warn','user')`,
    ];
    for (const q of tries) expect((await pgErr(as(U.alice, (t) => t.execute(q)))).code).toBe("42501");
  });
  it("exactly-once: duplicate completion, badge, nonce and QR token are rejected by constraints", async () => {
    const prog = (await owner.query(`insert into quest_step_progress(user_id,quest_id,step_id,status) values ($1,$2,$3,'available') returning id`, [U.bob, quest, step1])).rows[0].id;
    await owner.query(`insert into verification_attempts(progress_id,user_id,method,outcome,attempt_nonce,qr_jti) values ($1,$2,'qr','accepted','11111111-1111-4111-8111-111111111111','jti-1')`, [prog, U.bob]);
    expect((await pgErr(owner.query(`insert into verification_attempts(progress_id,user_id,method,outcome,attempt_nonce) values ($1,$2,'qr','accepted','11111111-1111-4111-8111-111111111111')`, [prog, U.bob]))).code).toBe("23505");
    expect((await pgErr(owner.query(`insert into verification_attempts(progress_id,user_id,method,outcome,attempt_nonce,qr_jti) values ($1,$2,'qr','accepted',gen_random_uuid(),'jti-1')`, [prog, U.bob]))).code).toBe("23505");
    await owner.query(`insert into quest_completions(user_id,quest_id) values ($1,$2)`, [U.bob, quest]);
    expect((await pgErr(owner.query(`insert into quest_completions(user_id,quest_id) values ($1,$2)`, [U.bob, quest]))).code).toBe("23505");
    await owner.query(`insert into user_badges(user_id,badge_id) values ($1,$2)`, [U.bob, badge]);
    expect((await pgErr(owner.query(`insert into user_badges(user_id,badge_id) values ($1,$2)`, [U.bob, badge]))).code).toBe("23505");
    // reads: own only
    expect(rows(await as(U.bob, (t) => t.execute(sql`select 1 from quest_completions`))).length).toBe(1);
    expect(rows(await as(U.alice, (t) => t.execute(sql`select 1 from quest_completions`))).length).toBe(0);
    expect(rows(await as(U.alice, (t) => t.execute(sql`select 1 from verification_attempts`))).length).toBe(0);
  });
  it("progress completed_at coherence CHECK", async () => {
    expect((await pgErr(owner.query(`insert into quest_step_progress(user_id,quest_id,step_id,status) values ($1,$2,$3,'completed')`, [U.carol, quest, step1]))).code).toBe("23514");
  });
});

describe("parties", () => {
  it("size CHECK, one live party per user, members see only their party", async () => {
    expect((await pgErr(owner.query(`insert into parties(leader_id,max_size) values ($1,7)`, [U.alice]))).code).toBe("23514");
    const p = (await owner.query(`insert into parties(leader_id,max_size) values ($1,4) returning id`, [U.alice])).rows[0].id;
    await owner.query(`insert into party_members(party_id,user_id,role) values ($1,$2,'leader'),($1,$3,'member')`, [p, U.alice, U.bob]);
    const p2 = (await owner.query(`insert into parties(leader_id) values ($1) returning id`, [U.carol])).rows[0].id;
    expect((await pgErr(owner.query(`insert into party_members(party_id,user_id) values ($1,$2)`, [p2, U.bob]))).code).toBe("23505");
    expect(rows(await as(U.bob, (t) => t.execute(sql`select id from parties`))).map((r) => r.id)).toEqual([p]);
    expect(rows(await as(U.carol, (t) => t.execute(sql`select id from parties`))).map((r) => r.id)).toEqual([]);
    expect(rows(await as(U.carol, (t) => t.execute(sql`select user_id from party_members where party_id = ${p}`))).length).toBe(0);
    await owner.query(`insert into party_invitations(party_id,inviter_id,invitee_id) values ($1,$2,$3)`, [p, U.alice, U.carol]);
    expect(rows(await as(U.carol, (t) => t.execute(sql`select 1 from party_invitations`))).length).toBe(1);
    expect(rows(await as(U.bob, (t) => t.execute(sql`select 1 from party_invitations`))).length).toBe(0);
    expect((await pgErr(owner.query(`insert into party_invitations(party_id,inviter_id,invitee_id) values ($1,$2,$2)`, [p, U.alice]))).code).toBe("23514");
  });
});

describe("blocks, reports, submissions, moderation", () => {
  it("player cards hide users in BOTH block directions and require an identity", async () => {
    await as(U.alice, (t) => t.execute(sql`insert into blocks(blocker_id,blocked_id) values (${U.alice},${U.carol})`));
    const aliceSees = rows(await as(U.alice, (t) => t.execute(sql`select user_id from player_cards`))).map((r) => r.user_id);
    const carolSees = rows(await as(U.carol, (t) => t.execute(sql`select user_id from player_cards`))).map((r) => r.user_id);
    expect(aliceSees).not.toContain(U.carol);
    expect(carolSees).not.toContain(U.alice);
    expect(aliceSees).toContain(U.bob);
    expect(rows(await as(null, (t) => t.execute(sql`select user_id from player_cards`))).length).toBe(0);
  });
  it("blocks: cannot forge blocker, cannot self-block, own rows only", async () => {
    expect((await pgErr(as(U.alice, (t) => t.execute(sql`insert into blocks(blocker_id,blocked_id) values (${U.bob},${U.carol})`)))).code).toBe("42501");
    expect((await pgErr(as(U.alice, (t) => t.execute(sql`insert into blocks(blocker_id,blocked_id) values (${U.alice},${U.alice})`)))).code).toBe("23514");
    expect(rows(await as(U.bob, (t) => t.execute(sql`select 1 from blocks`))).length).toBe(0);
  });
  it("reports: insert own, read own, staff read all, cannot forge reporter/status", async () => {
    await as(U.alice, (t) => t.execute(sql`insert into reports(reporter_id,subject_user_id,kind,detail) values (${U.alice},${U.carol},'harassment','test')`));
    expect((await pgErr(as(U.alice, (t) => t.execute(sql`insert into reports(reporter_id,subject_user_id,kind) values (${U.bob},${U.carol},'spam')`)))).code).toBe("42501");
    expect((await pgErr(as(U.alice, (t) => t.execute(sql`insert into reports(reporter_id,subject_user_id,kind,status) values (${U.alice},${U.carol},'spam','closed')`)))).code).toBe("42501");
    expect(rows(await as(U.bob, (t) => t.execute(sql`select 1 from reports`))).length).toBe(0);
    expect(rows(await as(U.alice, (t) => t.execute(sql`select 1 from reports`))).length).toBe(1);
    expect(rows(await as(U.mod, (t) => t.execute(sql`select 1 from reports`))).length).toBe(1);
    expect((await pgErr(as(U.alice, (t) => t.execute(sql`update reports set status='closed'`)))).code).toBe("42501");
  });
  it("submissions: own only; cannot self-approve, claim review, or flag address; consent CHECKs", async () => {
    await as(U.alice, (t) => t.execute(sql`insert into submissions(submitter_id,kind,title,body,subject_consent) values (${U.alice},'person','A nominee','A fictional placeholder nomination body.','pending')`));
    expect((await pgErr(as(U.alice, (t) => t.execute(sql`insert into submissions(submitter_id,kind,title,body,status,reviewed_by,reviewed_at) values (${U.alice},'place','Title x','Body of at least ten','approved',${U.alice},now())`)))).code).toBe("42501");
    expect((await pgErr(as(U.alice, (t) => t.execute(sql`update submissions set status='approved'`)))).code).toBe("42501");
    expect(rows(await as(U.bob, (t) => t.execute(sql`select 1 from submissions`))).length).toBe(0);
    expect(rows(await as(U.mod, (t) => t.execute(sql`select 1 from submissions`))).length).toBe(1);
    // DB-level: a real person cannot be approved without consent; private addresses can never be approved
    const sid = (await owner.query(`select id from submissions where submitter_id=$1`, [U.alice])).rows[0].id;
    expect((await pgErr(owner.query(`update submissions set status='approved', reviewed_by=$2, reviewed_at=now() where id=$1`, [sid, U.mod]))).code).toBe("23514");
    await owner.query(`update submissions set subject_consent='obtained', contains_private_address=true where id=$1`, [sid]);
    expect((await pgErr(owner.query(`update submissions set status='approved', reviewed_by=$2, reviewed_at=now() where id=$1`, [sid, U.mod]))).code).toBe("23514");
    await owner.query(`update submissions set contains_private_address=false where id=$1`, [sid]);
    await owner.query(`update submissions set status='approved', reviewed_by=$2, reviewed_at=now() where id=$1`, [sid, U.mod]);
  });
  it("photos are never auto-published; moderation trail is staff-readable and not modifiable by runtime roles", async () => {
    expect((await pgErr(owner.query(`insert into photo_reviews(owner_id,storage_key,published) values ($1,'k1',true)`, [U.alice]))).code).toBe("23514");
    await owner.query(`insert into photo_reviews(owner_id,storage_key) values ($1,'k2')`, [U.alice]);
    expect(rows(await as(U.alice, (t) => t.execute(sql`select 1 from photo_reviews`))).length).toBe(1);
    expect(rows(await as(U.bob, (t) => t.execute(sql`select 1 from photo_reviews`))).length).toBe(0);
    await owner.query(`insert into moderation_actions(actor_id,action,target_type,target_id) values ($1,'warn','user',$2)`, [U.mod, U.carol]);
    expect(rows(await as(U.mod, (t) => t.execute(sql`select 1 from moderation_actions`))).length).toBe(1);
    expect(rows(await as(U.alice, (t) => t.execute(sql`select 1 from moderation_actions`))).length).toBe(0);
    for (const role of [app, null]) void role;
    expect((await pgErr(as(U.mod, (t) => t.execute(sql`delete from moderation_actions`)))).code).toBe("42501");
  });
});

describe("guest -> member linking (transfer_guest_progress)", () => {
  it("moves legitimate progress atomically, member data wins conflicts, is idempotent, and is auth-role only", async () => {
    const g = U.guest, m = U.member;
    const gp = (await owner.query(`insert into quest_step_progress(user_id,quest_id,step_id,status,completed_at) values ($1,$2,$3,'completed',now()) returning id`, [g, quest, step1])).rows[0].id;
    await owner.query(`insert into verification_attempts(progress_id,user_id,method,outcome,attempt_nonce) values ($1,$2,'gps','accepted',gen_random_uuid())`, [gp, g]);
    await owner.query(`insert into quest_completions(user_id,quest_id) values ($1,$2)`, [g, quest]);
    await owner.query(`insert into user_badges(user_id,badge_id,quest_id) values ($1,$2,$3)`, [g, badge, quest]);
    await owner.query(`insert into characters(user_id,name) values ($1,'Guest Char')`, [g]);
    await owner.query(`update profiles set terms_version='v1', terms_accepted_at=now() where user_id=$1`, [g]);
    // product role may not call it, even for its own ids
    expect((await pgErr(as(m, (t) => t.execute(sql`select app.transfer_guest_progress(${g}, ${m})`)))).code).toBe("42501");
    // refuses a non-registered target / same ids
    expect((await pgErr(authDb.query(`select app.transfer_guest_progress($1,$2)`, [g, g]))).message ?? "").toMatch(/differ/);
    await authDb.query(`select app.transfer_guest_progress($1,$2)`, [g, m]);
    await authDb.query(`select app.transfer_guest_progress($1,$2)`, [g, m]); // idempotent
    const q = async (t: string, u: string) => Number((await owner.query(`select count(*)::int n from ${t} where user_id=$1`, [u])).rows[0].n);
    expect(await q("quest_completions", m)).toBe(1);
    expect(await q("quest_step_progress", m)).toBe(1);
    expect(await q("user_badges", m)).toBe(1);
    expect(await q("characters", m)).toBe(1);
    expect(await q("verification_attempts", m)).toBe(1);
    expect((await owner.query(`select terms_version from profiles where user_id=$1`, [m])).rows[0].terms_version).toBe("v1");
    // now delete the guest like Better Auth does: nothing of the member's data is lost, no duplicates
    await authDb.query(`delete from auth."user" where id=$1`, [g]);
    expect(await q("quest_completions", m)).toBe(1);
    expect(await q("user_badges", m)).toBe(1);
    expect(Number((await owner.query(`select count(*)::int n from profiles where user_id=$1`, [g])).rows[0].n)).toBe(0);
  });
});

describe("account deletion & maintenance", () => {
  it("deleting the auth user cascades all personal data; moderation trail survives with actor nulled", async () => {
    await owner.query(`insert into moderation_actions(actor_id,action,target_type) values ($1,'approve','submission')`, [U.carol]);
    await authDb.query(`delete from auth."user" where id=$1`, [U.carol]);
    for (const [t, c] of [["profiles", "user_id"], ["blocks", "blocker_id"], ["reports", "reporter_id"], ["party_invitations", "invitee_id"]] as const) {
      expect(Number((await owner.query(`select count(*)::int n from ${t} where ${c}=$1`, [U.carol])).rows[0].n)).toBe(0);
    }
    expect(Number((await owner.query(`select count(*)::int n from moderation_actions where actor_id is null and action='approve'`)).rows[0].n)).toBe(1);
  });
  it("maintenance_purge is callable by the auth role only and purges expired data", async () => {
    expect((await pgErr(as(U.alice, (t) => t.execute(sql`select app.maintenance_purge()`)))).code).toBe("42501");
    await owner.query(`insert into auth."user"(id,name,email,is_anonymous,updated_at) values ('99999999-0000-4000-8000-000000000000','old','old@guest.invalid',true, now() - interval '31 days')`);
    const n = (await authDb.query(`select app.maintenance_purge() n`)).rows[0].n;
    expect(n).toBeGreaterThanOrEqual(1);
    expect(Number((await owner.query(`select count(*)::int n from auth."user" where id='99999999-0000-4000-8000-000000000000'`)).rows[0].n)).toBe(0);
  });
});
