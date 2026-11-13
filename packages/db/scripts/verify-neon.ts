/**
 * Verifies a REAL Neon setup. Prints PASS/FAIL only - never connection strings or passwords.
 *   DATABASE_URL=<chowk_app pooled> AUTH_DATABASE_URL=<chowk_auth pooled> DATABASE_URL_UNPOOLED=<owner direct> \
 *     pnpm --filter @chowk/db exec tsx scripts/verify-neon.ts
 * The owner URL is used only to confirm migrations/roles exist; it is never used for anything the app does.
 */
import pg from "pg";
const need = (k: string) => { const v = process.env[k]; if (!v) { console.error(`missing ${k}`); process.exit(2); } return v; };
const app = new pg.Pool({ connectionString: need("DATABASE_URL"), max: 1 });
const auth = new pg.Pool({ connectionString: need("AUTH_DATABASE_URL"), max: 1 });
const owner = new pg.Pool({ connectionString: need("DATABASE_URL_UNPOOLED"), max: 1 });
let failed = 0;
const check = async (name: string, fn: () => Promise<boolean>) => {
  let ok = false; try { ok = await fn(); } catch { ok = false; }
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) failed++;
};
const host = (k: string) => new URL(need(k)).hostname;
await check("runtime URL uses the Neon -pooler host", async () => host("DATABASE_URL").includes("-pooler"));
await check("auth URL uses the Neon -pooler host", async () => host("AUTH_DATABASE_URL").includes("-pooler"));
await check("owner URL is the DIRECT host (no -pooler)", async () => !host("DATABASE_URL_UNPOOLED").includes("-pooler"));
await check("runtime role is unprivileged (no superuser/bypassrls/createrole/createdb)", async () => {
  const r = await app.query("select rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolname from pg_roles where rolname = current_user");
  const x = r.rows[0]; return x && x.rolname === "chowk_app" && !x.rolsuper && !x.rolbypassrls && !x.rolcreaterole && !x.rolcreatedb;
});
await check("auth role is chowk_auth and unprivileged", async () => {
  const r = await auth.query("select rolsuper, rolbypassrls, rolname from pg_roles where rolname = current_user");
  const x = r.rows[0]; return x && x.rolname === "chowk_auth" && !x.rolsuper && !x.rolbypassrls;
});
await check("migrations applied (23 tables)", async () => {
  const r = await owner.query("select count(*)::int n from pg_tables where schemaname in ('public','auth')");
  return r.rows[0].n >= 23;
});
await check("RLS enabled on every table", async () => {
  const r = await owner.query("select count(*)::int n from pg_tables where schemaname in ('public','auth') and not rowsecurity");
  return r.rows[0].n === 0;
});
await check("transaction-local identity works through the pooler and does not leak", async () => {
  const c = await app.connect();
  try {
    await c.query("begin"); await c.query("select set_config('app.user_id','11111111-1111-4111-8111-111111111111', true)");
    const inside = (await c.query("select app.current_user_id() u")).rows[0].u; await c.query("commit");
    const after = (await c.query("select app.current_user_id() u")).rows[0].u;
    return inside === "11111111-1111-4111-8111-111111111111" && after === null;
  } finally { c.release(); }
});
await check("product role cannot read the auth schema", async () => { try { await app.query('select 1 from auth."user" limit 1'); return false; } catch (e) { return (e as { code?: string }).code === "42501"; } });
await check("product role cannot read quest step secrets", async () => { try { await app.query("select 1 from quest_step_secrets limit 1"); return false; } catch (e) { return (e as { code?: string }).code === "42501"; } });
await check("playtest/placeholder content hidden unless flag is on (flag is currently OFF in production)", async () => {
  const flag = (await owner.query("select value from app.flags where key='allow_playtest_content'")).rows[0]?.value;
  const visible = (await app.query("select count(*)::int n from quests")).rows[0].n;
  return flag === false ? visible === 0 : true;
});
await app.end(); await auth.end(); await owner.end();
console.log(failed ? `${failed} CHECK(S) FAILED` : "ALL NEON CHECKS PASSED"); process.exit(failed ? 1 : 0);
