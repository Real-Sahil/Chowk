import type { UserId } from "@chowk/contracts";

/**
 * Who a database transaction runs on behalf of. This is the ONLY identity input to RLS.
 * `anon` = unauthenticated visitor (public reads only). Admin/moderator is NEVER passed in:
 * it is derived inside Postgres from `profiles.role` so a caller cannot claim it.
 */
export type DbActor = { readonly kind: "anon" } | { readonly kind: "user"; readonly userId: UserId };

/** Replaceable database port. `Tx` is the driver's transaction type (Drizzle in practice). */
export interface DatabaseAdapter<Tx> {
  /** Runs `fn` in ONE transaction with RLS identity set transaction-locally. Rolls back on throw. */
  withActor<T>(actor: DbActor, fn: (tx: Tx) => Promise<T>): Promise<T>;
  /** Cheap liveness probe (SELECT 1). */
  ping(): Promise<void>;
  close(): Promise<void>;
}
