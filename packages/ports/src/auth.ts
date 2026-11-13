import type { UserId } from "@chowk/contracts";

export interface AuthSession {
  readonly sessionId: string;
  readonly userId: UserId;
  readonly isGuest: boolean;
  readonly expiresAt: Date;
}

/**
 * Replaceable authentication port. Production implementation: self-hosted Better Auth (Next.js route
 * handlers + Drizzle adapter). Nothing outside the implementation may read auth tables or cookies.
 */
export interface AuthAdapter {
  /** Resolve the session from request headers (cookie). Must verify server-side, never trust the client. */
  getSession(headers: Headers): Promise<AuthSession | null>;
  /** Permanently delete the user and all auth records (account deletion). Cascades are enforced by the DB. */
  deleteUser(userId: UserId): Promise<void>;
}

/** Short-lived, audience-bound ticket that lets a browser join the realtime server without DB credentials. */
export interface RealtimeTicketAdapter {
  issue(session: AuthSession, audience: "lobby" | "party", ttlSeconds?: number): Promise<string>;
  verify(ticket: string, audience: "lobby" | "party"): Promise<{ userId: UserId; isGuest: boolean }>;
}
