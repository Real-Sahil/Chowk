import { ZodError } from "zod";
import { getServices } from "@/lib/services";
import { getAuthSession } from "@/lib/session";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const { auth, profiles } = await getServices();
  const s = await getAuthSession(auth, req.headers);
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401 });
  const c = await profiles.getCharacter(s.userId);
  return c ? Response.json(c) : Response.json({ error: "not_found" }, { status: 404 });
}

export async function PUT(req: Request) {
  const { auth, profiles } = await getServices();
  const s = await getAuthSession(auth, req.headers);
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    await profiles.upsertCharacter(s.userId, await req.json());
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof ZodError || e instanceof SyntaxError) return Response.json({ error: "bad_request" }, { status: 400 });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
