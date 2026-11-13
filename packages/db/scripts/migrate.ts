/**
 * Applies Drizzle migrations with the OWNER role over the DIRECT (unpooled) endpoint.
 * Usage: DATABASE_URL_UNPOOLED=... pnpm --filter @chowk/db db:migrate
 * Run by a developer or CI job - NEVER at app start, NEVER from a deployed runtime.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { fileURLToPath } from "node:url";

export async function runMigrations(url: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: fileURLToPath(new URL("../migrations", import.meta.url)) });
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL_UNPOOLED;
  if (!url) throw new Error("DATABASE_URL_UNPOOLED is required");
  await runMigrations(url);
  console.log("migrations applied");
}
