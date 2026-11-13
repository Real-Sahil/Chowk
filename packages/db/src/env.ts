import { z } from "zod";

/**
 * Runtime database environment. Deliberately has NO field for the unpooled/owner URL:
 * migrations read DATABASE_URL_UNPOOLED in drizzle.config.ts only, so no running service can hold it.
 */
const Url = z.string().url().refine((u) => /^postgres(ql)?:\/\//.test(u), "must be a postgres:// URL");

export const DbEnv = z
  .object({
    APP_ENV: z.enum(["local", "test", "staging", "production"]).default("local"),
    /** Runtime connection as the restricted `chowk_app` role. On Neon this MUST be the -pooler hostname. */
    DATABASE_URL: Url,
    DB_POOL_MAX: z.coerce.number().int().min(1).max(20).default(5),
  })
  .superRefine((env, ctx) => {
    const host = new URL(env.DATABASE_URL).hostname;
    const isNeon = host.endsWith(".neon.tech") || host.endsWith(".neon.build") || host.includes("neon.");
    if (isNeon && !host.includes("-pooler") && env.APP_ENV !== "local") {
      ctx.addIssue({ code: "custom", path: ["DATABASE_URL"], message: "Neon runtime URL must use the -pooler host" });
    }
    if (new URL(env.DATABASE_URL).username === "neondb_owner") {
      ctx.addIssue({ code: "custom", path: ["DATABASE_URL"], message: "runtime must not connect as the owner role" });
    }
  });
export type DbEnv = z.infer<typeof DbEnv>;

export function loadDbEnv(source: Record<string, string | undefined> = process.env): DbEnv {
  const parsed = DbEnv.safeParse(source);
  if (!parsed.success) {
    // Never echo values (they may contain credentials) - field paths and messages only.
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid database environment: ${msg}`);
  }
  return parsed.data;
}
