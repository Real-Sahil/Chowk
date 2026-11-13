import type pg from "pg";
import type { UserId } from "@chowk/contracts";

/**
 * Account deletion: removing the auth user cascades every personal row (FKs ON DELETE CASCADE, enforced by Postgres).
 * Sessions live in auth.session and cascade too, so every device is signed out immediately.
 * Runs on the auth role connection (chowk_auth is the only role with DELETE on auth."user").
 * Storage objects are deleted by the caller BEFORE this runs once photo storage exists (P6).
 * Moderation records keep an anonymised audit trail (actor_id set null).
 */
export async function deleteAccount(authPool: pg.Pool, userId: UserId): Promise<boolean> {
  const r = await authPool.query(`delete from auth."user" where id = $1`, [userId]);
  return (r.rowCount ?? 0) > 0;
}
