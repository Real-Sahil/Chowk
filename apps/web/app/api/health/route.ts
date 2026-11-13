import { getServices } from "@/lib/services";
import { classifyHealthError } from "@/lib/health";
export const runtime = "nodejs";

export async function GET() {
  try {
    const s = await getServices();
    await s.app.ping();
    // also prove the auth role works and the migrated schema exists
    await s.authPool.query('select 1 from auth."user" limit 1');
    return Response.json({ ok: true });
  } catch (e) {
    const appEnv = process.env.APP_ENV ?? "local";
    const c = classifyHealthError(e, appEnv);
    console.error(`[health] failed: ${c.reason}${c.detail ? ` (${c.detail})` : ""}`); // category only, no secrets
    return Response.json({ ok: false, ...c }, { status: 503 });
  }
}
