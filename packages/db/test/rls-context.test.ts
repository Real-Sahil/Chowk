import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { sql } from "drizzle-orm";
import { UserId } from "@chowk/contracts";
import { createNodeAdapter, loadDbEnv, assertUnprivilegedRole } from "../src/index.js";

/**
 * REAL PostgreSQL integration tests (no mocks). They fail loudly if the DB env is absent - never silently skip.
 * Fixture tables are created by the OWNER role; the code under test connects as the restricted `chowk_app` role.
 */
const OWNER_URL = process.env.TEST_OWNER_URL;
const APP_URL = process.env.DATABASE_URL;
if (!OWNER_URL || !APP_URL) throw new Error("TEST_OWNER_URL and DATABASE_URL are required (run `pnpm test` in packages/db)");

const A = UserId.parse("11111111-1111-4111-8111-111111111111");
const B = UserId.parse("22222222-2222-4222-8222-222222222222");
const ADMIN = UserId.parse("33333333-3333-4333-8333-333333333333");

const owner = new pg.Client({ connectionString: OWNER_URL });
// pool of ONE connection => every test transaction reuses the same physical connection, like PgBouncer would.
const one = await createNodeAdapter({ env: loadDbEnv({ DATABASE_URL: APP_URL, DB_POOL_MAX: "1", APP_ENV: "test" }) });
const many = await createNodeAdapter({ env: loadDbEnv({ DATABASE_URL: APP_URL, DB_POOL_MAX: "4", APP_ENV: "test" }) });

beforeAll(async () => {
  await owner.connect();
  await owner.query(`
    drop table if exists ctx_notes; drop table if exists ctx_profiles;
    create table ctx_profiles (user_id uuid primary key, role text not null default 'user' check (role in ('user','admin')));
    create table ctx_notes (id uuid primary key default gen_random_uuid(), owner_id uuid not null, body text not null);
    alter table ctx_profiles enable row level security; alter table ctx_profiles force row level security;
    alter table ctx_notes enable row level security;    alter table ctx_notes force row level security;
    -- profiles: readable by self; role changes are NOT granted to the app role at all
    create policy p_sel on ctx_profiles for select to chowk_app using (user_id = app.current_user_id());
    grant select on ctx_profiles to chowk_app;
    -- notes: owner access; admin derived from the DB row, never from a client/session claim
    create policy n_owner on ctx_notes for all to chowk_app
      using (owner_id = app.current_user_id()) with check (owner_id = app.current_user_id());
    create policy n_admin_read on ctx_notes for select to chowk_app
      using (exists (select 1 from ctx_profiles p where p.user_id = app.current_user_id() and p.role = 'admin'));
    grant select, insert, update, delete on ctx_notes to chowk_app;
    insert into ctx_profiles(user_id, role) values ('${A}','user'), ('${B}','user'), ('${ADMIN}','admin');
    insert into ctx_notes(owner_id, body) values ('${A}','a-note'), ('${B}','b-note');
  `);
});
afterAll(async () => {
  await owner.query("drop table if exists ctx_notes; drop table if exists ctx_profiles;");
  await owner.end();
  await one.close();
  await many.close();
});

/** Drizzle wraps driver errors; the real Postgres message/code lives on `cause`. */
async function pgError(p: Promise<unknown>): Promise<{ message: string; code?: string }> {
  try { await p; } catch (e) { const c = (e as { cause?: { message: string; code?: string } }).cause; return c ?? { message: String(e) }; }
  throw new Error("expected the query to be rejected by Postgres");
}
const bodies = (rows: unknown) => (rows as { rows: { body: string }[] }).rows.map((r) => r.body).sort();

describe("RLS identity propagation", () => {
  it("startup guard accepts the restricted role", async () => {
    expect(await assertUnprivilegedRole((one as never as { raw: never }).raw)).toBe("chowk_app");
  });

  it("startup guard REFUSES a superuser/owner credential", async () => {
    await expect(createNodeAdapter({ env: loadDbEnv({ DATABASE_URL: OWNER_URL, APP_ENV: "test" }) })).rejects.toThrow(/privileged/);
  });

  it("a user sees only their own rows", async () => {
    const r = await one.withActor({ kind: "user", userId: A }, (tx) => tx.execute(sql`select body from ctx_notes`));
    expect(bodies(r)).toEqual(["a-note"]);
  });

  it("anonymous (no identity) sees nothing", async () => {
    const r = await one.withActor({ kind: "anon" }, (tx) => tx.execute(sql`select body from ctx_notes`));
    expect(bodies(r)).toEqual([]);
  });

  it("WITH CHECK blocks writing a row owned by someone else", async () => {
    const e = await pgError(one.withActor({ kind: "user", userId: A }, (tx) => tx.execute(sql`insert into ctx_notes(owner_id, body) values (${B}, 'forged')`)));
    expect(e.message).toMatch(/row-level security/);
    expect(e.code).toBe("42501");
  });

  it("UPDATE/DELETE cannot touch another user's row (0 rows affected)", async () => {
    const r = (await one.withActor({ kind: "user", userId: A }, (tx) =>
      tx.execute(sql`update ctx_notes set body = 'pwn' where owner_id = ${B}`),
    )) as { rowCount: number };
    expect(r.rowCount).toBe(0);
  });

  it("identity does NOT leak to the next transaction on the same pooled connection", async () => {
    await one.withActor({ kind: "user", userId: A }, (tx) => tx.execute(sql`select 1`));
    const after = (await one.withActor({ kind: "anon" }, (tx) =>
      tx.execute(sql`select current_setting('app.user_id', true) as v`),
    )) as { rows: { v: string | null }[] };
    expect(after.rows[0]?.v ?? "").toBe("");
    const raw = (await one.withActor({ kind: "anon" }, (tx) => tx.execute(sql`select body from ctx_notes`))) as never;
    expect(bodies(raw)).toEqual([]);
  });

  it("identity is cleared after a failed (rolled back) transaction", async () => {
    await expect(
      one.withActor({ kind: "user", userId: A }, async (tx) => {
        await tx.execute(sql`select 1`);
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const r = await one.withActor({ kind: "anon" }, (tx) => tx.execute(sql`select body from ctx_notes`));
    expect(bodies(r)).toEqual([]);
  });

  it("rejects non-UUID identities before touching the database (injection attempt)", async () => {
    await expect(
      one.withActor({ kind: "user", userId: "x'); drop table ctx_notes; --" as never }, (tx) => tx.execute(sql`select 1`)),
    ).rejects.toThrow();
    const r = await owner.query("select count(*)::int as n from ctx_notes");
    expect(r.rows[0].n).toBeGreaterThan(0);
  });

  it("admin is derived from the database, so a normal user cannot claim it", async () => {
    const asUser = await one.withActor({ kind: "user", userId: B }, (tx) => tx.execute(sql`select body from ctx_notes`));
    expect(bodies(asUser)).toEqual(["b-note"]);
    const asAdmin = await one.withActor({ kind: "user", userId: ADMIN }, (tx) => tx.execute(sql`select body from ctx_notes`));
    expect(bodies(asAdmin)).toEqual(["a-note", "b-note"]);
  });

  it("the app role cannot promote itself (no UPDATE grant on profiles)", async () => {
    const e = await pgError(one.withActor({ kind: "user", userId: A }, (tx) => tx.execute(sql`update ctx_profiles set role = 'admin' where user_id = ${A}`)));
    expect(e.message).toMatch(/permission denied/);
    expect(e.code).toBe("42501");
  });

  it("the app role cannot change identity mid-session via plain SET to escape isolation across txns", async () => {
    // Even if buggy code ran a session-level SET, the next withActor() re-binds identity at transaction start.
    await one.withActor({ kind: "user", userId: A }, (tx) => tx.execute(sql`set app.user_id = '${sql.raw(B)}'`));
    const r = await one.withActor({ kind: "user", userId: A }, (tx) => tx.execute(sql`select body from ctx_notes`));
    expect(bodies(r)).toEqual(["a-note"]);
  });

  it("40 concurrent transactions across a small pool never see each other's rows", async () => {
    const results = await Promise.all(
      Array.from({ length: 40 }, (_, i) => {
        const who = i % 2 === 0 ? A : B;
        return many
          .withActor({ kind: "user", userId: who }, (tx) => tx.execute(sql`select pg_sleep(0.01), body from ctx_notes`))
          .then((r) => ({ who, b: bodies(r) }));
      }),
    );
    for (const r of results) expect(r.b).toEqual(r.who === A ? ["a-note"] : ["b-note"]);
  });

  it("owner role cannot be used at runtime: env validation rejects neondb_owner", () => {
    expect(() => loadDbEnv({ DATABASE_URL: "postgres://neondb_owner:x@ep-x-pooler.us-east-2.aws.neon.tech/db", APP_ENV: "production" })).toThrow(/owner/);
  });

  it("env validation requires the -pooler host on Neon outside local", () => {
    expect(() => loadDbEnv({ DATABASE_URL: "postgres://chowk_app:x@ep-x.us-east-2.aws.neon.tech/db", APP_ENV: "production" })).toThrow(/pooler/);
    expect(loadDbEnv({ DATABASE_URL: "postgres://chowk_app:x@ep-x-pooler.us-east-2.aws.neon.tech/db", APP_ENV: "production" }).DB_POOL_MAX).toBe(5);
  });
});
