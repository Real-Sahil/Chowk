import pg from "pg";
import { createNodeAdapter, loadDbEnv } from "@chowk/db";
import { createAuth } from "./auth";
import { createConsoleSender, createResendSender } from "./email";
import { loadWebEnv } from "./env";
import { createProfileService } from "../services/profile";

/**
 * Process-wide singletons (module scope), as Vercel recommends for pooled DB clients on Fluid compute.
 * Two DIFFERENT roles: `app` (chowk_app, RLS) for product data; `authPool` (chowk_auth) for the auth module only.
 */
let cached: ReturnType<typeof build> | undefined;
async function build() {
  const env = loadWebEnv();
  const dbEnv = loadDbEnv({ DATABASE_URL: env.DATABASE_URL, APP_ENV: env.APP_ENV });
  const app = await createNodeAdapter({ env: dbEnv });
  const authPool = new pg.Pool({ connectionString: env.AUTH_DATABASE_URL, max: dbEnv.DB_POOL_MAX, idleTimeoutMillis: 10_000 });
  const email = env.EMAIL_PROVIDER === "resend" ? createResendSender(env.RESEND_API_KEY!, env.EMAIL_FROM!) : createConsoleSender();
  const auth = createAuth({ env, authPool, email });
  return { env, app, authPool, auth, profiles: createProfileService(app as never) };
}
export function getServices() {
  return (cached ??= build());
}
