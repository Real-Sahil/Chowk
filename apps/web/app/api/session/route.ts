import { getServices } from "@/lib/services";
import { createRateLimiter } from "@/lib/ratelimit";
import { ensureSession } from "@/lib/session";
export const runtime = "nodejs";

const limiter = createRateLimiter(10, 60_000); // new guest sessions per IP per minute, per instance

/** Idempotent "make sure I have a session". No credentials, no email, no login. */
export async function POST(req: Request) {
  const { auth } = await getServices();
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return Response.json({ error: "forbidden" }, { status: 403 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const r0 = await ensureSession(auth, req.headers).catch(() => null);
  if (r0 && !r0.created) return Response.json({ userId: r0.session.userId, isGuest: r0.session.isGuest, created: false });
  if (r0?.created && !limiter.allow(ip)) {
    // over the limit: a session was minted above; refuse to hand it out (it expires/purges as an unused guest)
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }
  if (!r0) return Response.json({ error: "unavailable" }, { status: 503 });
  const res = Response.json({ userId: r0.session.userId, isGuest: r0.session.isGuest, created: true });
  for (const c of r0.setCookies) res.headers.append("Set-Cookie", c);
  return res;
}
