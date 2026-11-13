import { z } from "zod";

const flag = (d: "true" | "false") => z.enum(["true", "false"]).default(d).transform((v) => v === "true");

/** Server-only environment for the web app. NEVER read DATABASE_URL_UNPOOLED here (migrations only). */
export const WebEnv = z
  .object({
    APP_ENV: z.enum(["local", "test", "staging", "production"]).default("local"),
    DATABASE_URL: z.string().url(), // chowk_app (pooled on Neon)
    AUTH_DATABASE_URL: z.string().url(), // chowk_auth (pooled on Neon); auth module only
    BETTER_AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
    BETTER_AUTH_URL: z.string().url(),
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
    GUEST_MODE_ENABLED: flag("true"),
    MAGIC_LINK_ENABLED: flag("false"),
    EMAIL_PROVIDER: z.enum(["console", "resend"]).default("console"),
    RESEND_API_KEY: z.string().min(1).optional(),
    EMAIL_FROM: z.string().min(3).optional(),
  })
  .superRefine((e, ctx) => {
    if (!!e.GOOGLE_CLIENT_ID !== !!e.GOOGLE_CLIENT_SECRET)
      ctx.addIssue({ code: "custom", path: ["GOOGLE_CLIENT_ID"], message: "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together" });
    if (e.MAGIC_LINK_ENABLED && e.EMAIL_PROVIDER === "console" && e.APP_ENV === "production")
      ctx.addIssue({ code: "custom", path: ["EMAIL_PROVIDER"], message: "the console email provider is development-only" });
    if (e.EMAIL_PROVIDER === "resend" && (!e.RESEND_API_KEY || !e.EMAIL_FROM))
      ctx.addIssue({ code: "custom", path: ["RESEND_API_KEY"], message: "RESEND_API_KEY and EMAIL_FROM are required for the resend provider" });
    if (e.APP_ENV === "production" && e.DATABASE_URL === e.AUTH_DATABASE_URL)
      ctx.addIssue({ code: "custom", path: ["AUTH_DATABASE_URL"], message: "auth and app must use different database roles" });
  });
export type WebEnv = z.infer<typeof WebEnv>;

export function loadWebEnv(source: Record<string, string | undefined> = process.env): WebEnv {
  const r = WebEnv.safeParse(source);
  if (!r.success) throw new Error("Invalid web environment: " + r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return r.data;
}
