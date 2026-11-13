import { sql } from "drizzle-orm";
import { UserId } from "@chowk/contracts";
import type { DbActor } from "@chowk/ports";

/** Minimal shape both Drizzle drivers' transactions satisfy. */
export interface SqlExecutor {
  execute(query: ReturnType<typeof sql>): Promise<unknown>;
}

/**
 * Binds the RLS identity to the CURRENT transaction. Must be the first statement of every transaction.
 * - Value is validated as a UUID first (defence in depth; it is also passed as a bound parameter, never interpolated).
 * - `set_config(..., true)` is transaction-local == SET LOCAL: supported by Neon's PgBouncer transaction pooling,
 *   auto-reset at COMMIT/ROLLBACK, so it cannot leak to another request reusing the connection.
 * - Plain `SET` (session-level) is forbidden: it would persist on the pooled connection.
 */
export async function bindActor(tx: SqlExecutor, actor: DbActor): Promise<void> {
  const userId = actor.kind === "user" ? UserId.parse(actor.userId) : "";
  await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
}
