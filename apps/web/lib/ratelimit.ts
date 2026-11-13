/**
 * Fixed-window limiter, PER SERVER INSTANCE (in memory). On Vercel each function instance has its own counters,
 * so this only slows abuse; a shared limiter is planned for hardening (docs/security.md ABUSE-2). Documented limitation.
 */
export function createRateLimiter(max: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, { n: number; reset: number }>();
  return {
    allow(key: string): boolean {
      const t = now();
      const h = hits.get(key);
      if (!h || h.reset <= t) {
        if (hits.size > 5000) for (const [k, v] of hits) if (v.reset <= t) hits.delete(k);
        hits.set(key, { n: 1, reset: t + windowMs });
        return true;
      }
      h.n += 1;
      return h.n <= max;
    },
  };
}
