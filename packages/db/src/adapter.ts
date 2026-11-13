import { drizzle as drizzleNode, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzleNeon, type NeonDatabase } from "drizzle-orm/neon-serverless";
import { sql } from "drizzle-orm";
import pg from "pg";
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import type { DatabaseAdapter, DbActor } from "@chowk/ports";
import { bindActor } from "./context.js";
import { assertUnprivilegedRole } from "./guard.js";
import { loadDbEnv, type DbEnv } from "./env.js";

type AnyDb = NodePgDatabase | NeonDatabase;
export type ChowkTx<D extends AnyDb> = Parameters<Parameters<D["transaction"]>[0]>[0];

class DrizzleAdapter<D extends AnyDb> implements DatabaseAdapter<ChowkTx<D>> {
  constructor(
    private readonly db: D,
    private readonly closeFn: () => Promise<void>,
  ) {}

  async withActor<T>(actor: DbActor, fn: (tx: ChowkTx<D>) => Promise<T>): Promise<T> {
    // One interactive transaction: bind identity first, then run caller code. Throw => ROLLBACK.
    return (this.db as NodePgDatabase).transaction(async (tx) => {
      await bindActor(tx as never, actor);
      return fn(tx as never);
    }) as Promise<T>;
  }
  async ping(): Promise<void> {
    await this.db.execute(sql`select 1`);
  }
  close(): Promise<void> {
    return this.closeFn();
  }
  /** Exposed for the startup guard only. */
  get raw(): D {
    return this.db;
  }
}

export interface CreateOptions {
  env?: DbEnv;
  /** Run the privileged-role guard (default true). Only tests that deliberately use an owner URL disable it. */
  guard?: boolean;
}

/** Node (long-lived process: Colyseus on Render, local dev, tests, scripts). TCP via `pg`. */
export async function createNodeAdapter(opts: CreateOptions = {}) {
  const env = opts.env ?? loadDbEnv();
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: env.DB_POOL_MAX, idleTimeoutMillis: 10_000 });
  const adapter = new DrizzleAdapter(drizzleNode(pool), () => pool.end());
  if (opts.guard !== false) await assertUnprivilegedRole(adapter.raw);
  return adapter;
}

/**
 * Serverless/edge runtime (Cloudflare Workers via OpenNext, Vercel, etc). WebSocket-based Pool is REQUIRED for
 * interactive transactions (the HTTP driver cannot hold set_config + queries in one transaction).
 * Create per request on Workers (I/O objects cannot be shared across requests) and close in `waitUntil`.
 */
export async function createNeonAdapter(opts: CreateOptions & { webSocketConstructor?: unknown } = {}) {
  const env = opts.env ?? loadDbEnv();
  if (opts.webSocketConstructor) neonConfig.webSocketConstructor = opts.webSocketConstructor as never;
  const pool = new NeonPool({ connectionString: env.DATABASE_URL, max: env.DB_POOL_MAX });
  const adapter = new DrizzleAdapter(drizzleNeon(pool), () => pool.end());
  if (opts.guard !== false) await assertUnprivilegedRole(adapter.raw);
  return adapter;
}
