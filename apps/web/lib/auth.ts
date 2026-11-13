import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { anonymous, magicLink } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/node-postgres";
import type pg from "pg";
import { authAccount, authSession, authUser, authVerification } from "@chowk/db/schema";
import type { EmailSender } from "./email";
import type { WebEnv } from "./env";

export interface AuthDeps {
  env: WebEnv;
  /** Pool authenticated as the restricted `chowk_auth` role. */
  authPool: pg.Pool;
  email: EmailSender;
}

/**
 * Better Auth, self-hosted. Notes:
 * - Neon's MANAGED Better Auth lacks the anonymous plugin, so guest mode requires self-hosting (docs/free-tier.md §2).
 * - UUID primary keys so auth ids == profiles.user_id == every FK.
 * - Guest -> member linking: `onLinkAccount` runs app.transfer_guest_progress BEFORE Better Auth deletes the guest.
 *   If the transfer throws, the link fails and the guest keeps their data.
 * - Rate limiting: Better Auth's built-in limiter is per-instance memory (not shared across serverless instances).
 *   A shared limiter is part of P8 hardening; documented as a known limitation.
 */
export function createAuth({ env, authPool, email }: AuthDeps) {
  const db = drizzle(authPool);
  const google = env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } : undefined;
  return betterAuth({
    appName: "Chowk",
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.BETTER_AUTH_URL],
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user: authUser, session: authSession, account: authAccount, verification: authVerification },
    }),
    advanced: {
      database: { generateId: "uuid" },
      // Explicit: Better Auth otherwise DISABLES origin/CSRF checks whenever it detects a test environment.
      disableOriginCheck: false,
      disableCSRFCheck: false,
      useSecureCookies: env.APP_ENV === "production" || env.APP_ENV === "staging",
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
    },
    // Sliding 30-day session: guests keep their account without logging in (matches the 30-day inactivity purge).
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    account: { accountLinking: { enabled: true, trustedProviders: ["google"] } },
    socialProviders: google ? { google } : {},
    plugins: [
      ...(env.GUEST_MODE_ENABLED
        ? [
            anonymous({
              async onLinkAccount({ anonymousUser, newUser }) {
                await authPool.query("select app.transfer_guest_progress($1::uuid, $2::uuid)", [anonymousUser.user.id, newUser.user.id]);
              },
            }),
          ]
        : []),
      ...(env.MAGIC_LINK_ENABLED
        ? [magicLink({ expiresIn: 60 * 10, sendMagicLink: async ({ email: to, url }) => email.sendMagicLink({ to, url }) })]
        : []),
    ],
  });
}
export type ChowkAuth = ReturnType<typeof createAuth>;
