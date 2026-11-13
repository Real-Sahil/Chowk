import { defineConfig } from "drizzle-kit";

/**
 * Migrations connect with the OWNER role over the DIRECT (unpooled) Neon endpoint.
 * This is the ONLY file that reads DATABASE_URL_UNPOOLED; no runtime module may.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  schemaFilter: ["public", "auth"],
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED ?? "postgres://invalid" },
  strict: true,
  verbose: true,
});
