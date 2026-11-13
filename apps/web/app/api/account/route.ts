import { getServices } from "@/lib/services";
import { getAuthSession } from "@/lib/session";
import { deleteAccount } from "@/services/account";
export const runtime = "nodejs";

export async function DELETE(req: Request) {
  const { auth, authPool } = await getServices();
  // CSRF: state-changing route requires same-origin (SameSite=Lax cookie is the second layer).
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return Response.json({ error: "forbidden" }, { status: 403 });
  const s = await getAuthSession(auth, req.headers);
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401 });
  const deleted = await deleteAccount(authPool, s.userId);
  const res = Response.json({ deleted });
  // expire the session cookies on the client as well
  for (const name of ["better-auth.session_token", "__Secure-better-auth.session_token", "better-auth.session_data", "__Secure-better-auth.session_data"])
    res.headers.append("Set-Cookie", `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
  return res;
}
