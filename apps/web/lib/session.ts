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

export interface EnsureResult { session: AuthSession; created: boolean; setCookies: string[] }

/**
 * Login is NEVER required: every visitor gets a guest session automatically. Idempotent: an existing valid session
 * is returned as-is. Guests can later (optionally) link Google/magic link to protect their progress; until then,
 * progress lives with the browser's cookie (clearing cookies loses a guest account - tell players).
 */
export async function ensureSession(auth: ChowkAuth, headers: Headers): Promise<EnsureResult | null> {
  const existing = await getAuthSession(auth, headers);
  if (existing) return { session: existing, created: false, setCookies: [] };
  const api = auth.api as unknown as { signInAnonymous?: (o: { headers: Headers; asResponse: true }) => Promise<Response> };
  if (typeof api.signInAnonymous !== "function") return null; // guest mode disabled (plugin not loaded)
  const res = await api.signInAnonymous({ headers, asResponse: true });
  if (!res.ok) return null; // guest mode disabled or failed
  const setCookies = res.headers.getSetCookie();
  const cookie = setCookies.map((c) => c.split(";")[0]).join("; ");
  const created = await getAuthSession(auth, new Headers({ cookie }));
  return created ? { session: created, created: true, setCookies } : null;
}
