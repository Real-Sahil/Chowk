import { toNextJsHandler } from "better-auth/next-js";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";
export async function GET(req: Request) { return toNextJsHandler((await getServices()).auth).GET(req); }
export async function POST(req: Request) { return toNextJsHandler((await getServices()).auth).POST(req); }
