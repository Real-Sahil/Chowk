import { getServices } from "@/lib/services";
export const runtime = "nodejs";
export async function GET() {
  try { await (await getServices()).app.ping(); return Response.json({ ok: true }); }
  catch { return Response.json({ ok: false }, { status: 503 }); } // never leak error details
}
