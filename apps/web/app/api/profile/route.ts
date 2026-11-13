import { ZodError } from "zod";
import { getServices } from "@/lib/services";
import { getAuthSession } from "@/lib/session";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const { auth, profiles } = await getServices();
  const s = await getAuthSession(auth, req.headers);
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401 });
  const p = await profiles.getOwn(s.userId);
  return p ? Response.json(p) : Response.json({ error: "not_found" }, { status: 404 });
}

export async function PATCH(req: Request) {
  const { auth, profiles } = await getServices();
  const s = await getAuthSession(auth, req.headers);
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    return Response.json(await profiles.update(s.userId, await req.json()));
  } catch (e) {
    if (e instanceof ZodError || e instanceof SyntaxError) return Response.json({ error: "bad_request" }, { status: 400 });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
