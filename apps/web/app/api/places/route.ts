import { sql } from "drizzle-orm";
import { getServices } from "@/lib/services";
import { getAuthSession } from "@/lib/session";
export const runtime = "nodejs";

/** Public places the caller is allowed to see. RLS (not this code) decides which rows come back. */
export async function GET(req: Request) {
  const { auth, app } = await getServices();
  const s = await getAuthSession(auth, req.headers);
  const actor = s ? ({ kind: "user", userId: s.userId } as const) : ({ kind: "anon" } as const);
  const r = (await (app as never as { withActor: Function }).withActor(actor, (tx: { execute: Function }) =>
    tx.execute(sql`select slug, name, kind, district, lat, lng, geofence_radius_m, accessibility_notes, safety_notes from places order by name limit 200`),
  )) as { rows: Record<string, unknown>[] };
  return Response.json({
    places: r.rows.map((p) => ({
      slug: p.slug, name: p.name, kind: p.kind, district: p.district,
      lat: Number(p.lat), lng: Number(p.lng), radiusM: Number(p.geofence_radius_m),
      accessibilityNotes: p.accessibility_notes, safetyNotes: p.safety_notes,
    })),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
