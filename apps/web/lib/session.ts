import { UserId } from "@chowk/contracts";
import type { AuthSession } from "@chowk/ports";
import type { ChowkAuth } from "./auth";

/** Resolves the server-verified session. The ONLY place cookies become an identity. */
export async function getAuthSession(auth: ChowkAuth, headers: Headers): Promise<AuthSession | null> {
  const s = await auth.api.getSession({ headers });
  if (!s) return null;
  const parsed = UserId.safeParse(s.user.id);
  if (!parsed.success) return null;
  return {
    sessionId: s.session.id,
    userId: parsed.data,
    isGuest: Boolean((s.user as { isAnonymous?: boolean | null }).isAnonymous),
    expiresAt: new Date(s.session.expiresAt),
  };
}
