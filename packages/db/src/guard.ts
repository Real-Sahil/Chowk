import { sql } from "drizzle-orm";
import type { SqlExecutor } from "./context";

interface Row {
  rolname: string;
  rolsuper: boolean;
  rolbypassrls: boolean;
  rolcreaterole: boolean;
  rolcreatedb: boolean;
}

/**
 * Startup guard (DB-3): refuse to run if the runtime credential is privileged. If someone points DATABASE_URL
 * at the owner/superuser, RLS would be silently bypassed - fail closed instead.
 */
export async function assertUnprivilegedRole(db: { execute: SqlExecutor["execute"] }): Promise<string> {
  const res = (await db.execute(
    sql`select rolname, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb from pg_roles where rolname = current_user`,
  )) as { rows: Row[] };
  const r = res.rows[0];
  if (!r) throw new Error("cannot determine current database role");
  if (r.rolsuper || r.rolbypassrls || r.rolcreaterole || r.rolcreatedb) {
    throw new Error(`database role "${r.rolname}" is privileged (superuser/bypassrls/createrole/createdb); refusing to start`);
  }
  return r.rolname;
}
