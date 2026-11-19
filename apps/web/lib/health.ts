export type HealthReason = "config" | "db_auth" | "db_unreachable" | "db_schema" | "db_role" | "unknown";

/**
 * Turns a startup/DB error into a SAFE category (never connection strings, passwords or stack traces).
 * Outside production, `detail` lists the NAMES of invalid settings (e.g. "BETTER_AUTH_SECRET") to speed up setup.
 */
export function classifyHealthError(e: unknown, appEnv: string): { reason: HealthReason; detail?: string } {
  const err = e as { message?: string; code?: string; cause?: { code?: string; message?: string } };
  const code = err.code ?? err.cause?.code;
  const msg = String(err.message ?? "");
  if (msg.startsWith("Invalid web environment") || msg.startsWith("Invalid database environment")) {
    // Zod issues are "<FIELD>: <fixed reason>" and never echo the value, so this is safe to show outside production.
    const issues = msg.replace(/^Invalid (?:web|database) environment:\s*/, "").slice(0, 300);
    return { reason: "config", ...(appEnv !== "production" && issues ? { detail: issues } : {}) };
  }
  if (msg.includes("is privileged")) return { reason: "db_role" };
  if (code === "28P01" || code === "28000") return { reason: "db_auth" };
  if (code === "42P01" || code === "3D000" || code === "42501") return { reason: "db_schema" };
  if (code && ["ENOTFOUND", "ECONNREFUSED", "ETIMEDOUT", "ECONNRESET", "57P03", "08006", "08001"].includes(code)) return { reason: "db_unreachable" };
  return { reason: "unknown" };
}
