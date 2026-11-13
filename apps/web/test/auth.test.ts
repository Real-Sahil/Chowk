import { afterAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createNodeAdapter, loadDbEnv } from "@chowk/db";
import { createAuth } from "../lib/auth";
import { createConsoleSender } from "../lib/email";
import { loadWebEnv } from "../lib/env";
import { getAuthSession } from "../lib/session";
import { createProfileService } from "../services/profile";
import { deleteAccount } from "../services/account";
import { runSeed } from "../../../packages/db/seed/run-seed";

/** REAL database + REAL Better Auth handler (no mocks). Requests are made at HTTP level via auth.handler(Request). */
const OWNER = process.env.TEST_OWNER_URL!, APP = process.env.DATABASE_URL!, AUTHURL = process.env.AUTH_DATABASE_URL!;
if (!OWNER || !APP || !AUTHURL) throw new Error("run via `pnpm --filter @chowk/web test` (needs TEST_OWNER_URL, DATABASE_URL, AUTH_DATABASE_URL)");

const BASE = "http://localhost:3000";
const baseEnv = { APP_ENV: "test", DATABASE_URL: APP, AUTH_DATABASE_URL: AUTHURL, BETTER_AUTH_SECRET: "s".repeat(48), BETTER_AUTH_URL: BASE, MAGIC_LINK_ENABLED: "true", EMAIL_PROVIDER: "console" };
const owner = new pg.Pool({ connectionString: OWNER, max: 2 });
const authPool = new pg.Pool({ connectionString: AUTHURL, max: 4 });
const app = await createNodeAdapter({ env: loadDbEnv({ DATABASE_URL: APP, APP_ENV: "test" }) });
const email = createConsoleSender(() => {});
const auth = createAuth({ env: loadWebEnv(baseEnv), authPool, email });
const profiles = createProfileService(app as never);
afterAll(async () => { await owner.end(); await authPool.end(); await app.close(); });

const jar = (res: Response, prev = "") => {
  const m = new Map(prev.split("; ").filter(Boolean).map((c) => [c.split("=")[0]!, c] as const));
  for (const sc of res.headers.getSetCookie()) { const [nv] = sc.split(";"); const name = nv!.split("=")[0]!; if (/=\s*$/.test(nv!)) m.delete(name); else m.set(name, nv!); }
  return [...m.values()].join("; ");
};
const call = (path: string, init: RequestInit & { cookie?: string } = {}) =>
  auth.handler(new Request(BASE + path, { ...init, headers: { origin: BASE, "content-type": "application/json", ...(init.cookie ? { cookie: init.cookie } : {}), ...(init.headers as object) } }));
const sessionOf = (cookie: string) => getAuthSession(auth, new Headers({ cookie }));
const n = async (q: string, p: unknown[] = []) => Number((await owner.query(q, p)).rows[0].n);

describe("environment validation", () => {
  it("fails closed on weak/inconsistent config without echoing values", () => {
    expect(() => loadWebEnv({ ...baseEnv, BETTER_AUTH_SECRET: "short" })).toThrow(/BETTER_AUTH_SECRET/);
    expect(() => loadWebEnv({ ...baseEnv, GOOGLE_CLIENT_ID: "id" })).toThrow(/together/);
    expect(() => loadWebEnv({ ...baseEnv, APP_ENV: "production", EMAIL_PROVIDER: "console" })).toThrow(/development-only/);
    expect(() => loadWebEnv({ ...baseEnv, APP_ENV: "production", EMAIL_PROVIDER: "resend", AUTH_DATABASE_URL: APP })).toThrow(/different database roles/);
    try { loadWebEnv({ ...baseEnv, BETTER_AUTH_SECRET: "supersecretvalue" }); } catch (e) { expect(String(e)).not.toContain("supersecretvalue"); }
  });
});

describe("guest mode + profile creation", () => {
  let cookie = "", guestId = "";
  it("anonymous sign-in creates a real guest user, session cookie and profile row", async () => {
    const res = await call("/api/auth/sign-in/anonymous", { method: "POST", body: "{}" });
    expect(res.status).toBe(200);
    cookie = jar(res);
    expect(cookie).toContain("better-auth.session_token");
    const s = await sessionOf(cookie);
    expect(s?.isGuest).toBe(true);
    guestId = s!.userId;
    expect((await owner.query(`select is_guest, display_name from profiles where user_id=$1`, [guestId])).rows[0]).toMatchObject({ is_guest: true });
    expect(res.headers.getSetCookie().join(";").toLowerCase()).toContain("httponly");
  });
  it("no cookie / tampered cookie = no session", async () => {
    expect(await sessionOf("")).toBeNull();
    expect(await sessionOf(cookie.replace(/.$/, "x"))).toBeNull();
  });
  it("profile creation: display name, avatar, consent timestamps are server-set; invalid input rejected", async () => {
    const p = await profiles.update(guestId as never, { displayName: "Test Guest", avatarKey: "teal", acceptTerms: { version: "v1" }, acceptPrivacy: { version: "v1" }, locationConsent: true });
    expect(p).toMatchObject({ displayName: "Test Guest", avatarKey: "teal", isGuest: true, termsAccepted: true, privacyAccepted: true, locationConsent: true });
    await expect(profiles.update(guestId as never, { avatarKey: "nope" })).rejects.toThrow();
    await expect(profiles.update(guestId as never, { displayName: "x" })).rejects.toThrow();
    await expect(profiles.update(guestId as never, { role: "admin" })).rejects.toThrow(); // strict: unknown keys rejected
    await expect(profiles.update(guestId as never, { displayName: "<script>" })).rejects.toThrow();
  });
  it("character creation persists and is owner-scoped", async () => {
    await profiles.upsertCharacter(guestId as never, { name: "Test Char", story: "[PLACEHOLDER] story", appearance: { skin: "tone-2", outfit: "teal", accessory: "scarf" } });
    expect((await profiles.getCharacter(guestId as never))?.name).toBe("Test Char");
    await expect(profiles.upsertCharacter(guestId as never, { name: "x", appearance: {} })).rejects.toThrow();
  });
});

describe("guest -> registered account linking keeps legitimate progress", () => {
  it("magic-link sign-in from a guest session transfers progress, then removes the guest", async () => {
    await runSeed(OWNER);
    const g = await call("/api/auth/sign-in/anonymous", { method: "POST", body: "{}" });
    let cookie = jar(g);
    const guest = (await sessionOf(cookie))!;
    const q = (await owner.query(`select q.id quest, q.reward_badge_id badge, s.id step from quests q join quest_steps s on s.quest_id=q.id where q.slug='ph-the-chai-circuit' and s.ordinal=0`)).rows[0];
    // legitimate progress as the guest (written by the owner here to stand in for the server-side verifier)
    await owner.query(`insert into quest_step_progress(user_id,quest_id,step_id,status,completed_at) values ($1,$2,$3,'completed',now())`, [guest.userId, q.quest, q.step]);
    await owner.query(`insert into user_badges(user_id,badge_id,quest_id) values ($1,$2,$3)`, [guest.userId, q.badge, q.quest]);
    await profiles.update(guest.userId, { displayName: "Linked Player", acceptTerms: { version: "v1" } });

    const sent = await call("/api/auth/sign-in/magic-link", { method: "POST", body: JSON.stringify({ email: "linker@example.test" }), cookie });
    expect(sent.status).toBe(200);
    const link = email.sent.at(-1)!;
    expect(link.to).toBe("linker@example.test");
    const verify = await call(new URL(link.url).pathname + new URL(link.url).search, { method: "GET", cookie, redirect: "manual" } as never);
    expect([200, 302]).toContain(verify.status);
    cookie = jar(verify, cookie);
    const member = (await sessionOf(cookie))!;
    expect(member.isGuest).toBe(false);
    expect(member.userId).not.toBe(guest.userId);

    expect(await n(`select count(*)::int n from quest_step_progress where user_id=$1 and status='completed'`, [member.userId])).toBe(1);
    expect(await n(`select count(*)::int n from user_badges where user_id=$1`, [member.userId])).toBe(1);
    expect(await n(`select count(*)::int n from auth."user" where id=$1`, [guest.userId])).toBe(0); // guest removed
    expect(await n(`select count(*)::int n from quest_step_progress where user_id=$1`, [guest.userId])).toBe(0);
    expect((await owner.query(`select is_guest, terms_version from profiles where user_id=$1`, [member.userId])).rows[0]).toEqual({ is_guest: false, terms_version: "v1" });

    // replay: the same magic-link token cannot be used again
    const again = await call(new URL(link.url).pathname + new URL(link.url).search, { method: "GET", redirect: "manual" } as never);
    const replayCookie = jar(again);
    expect(await sessionOf(replayCookie)).toBeNull();
  });
});

describe("account deletion", () => {
  it("removes every personal row and invalidates the session on all devices", async () => {
    const g = await call("/api/auth/sign-in/anonymous", { method: "POST", body: "{}" });
    const cookie = jar(g);
    const s = (await sessionOf(cookie))!;
    await profiles.upsertCharacter(s.userId, { name: "Doomed", appearance: { skin: "tone-1", outfit: "indigo", accessory: "none" } });
    await owner.query(`insert into reports(reporter_id,kind,detail) values ($1,'safety','x')`, [s.userId]);
    expect(await deleteAccount(authPool, s.userId)).toBe(true);
    for (const t of ["profiles", "characters"]) expect(await n(`select count(*)::int n from ${t} where user_id=$1`, [s.userId])).toBe(0);
    expect(await n(`select count(*)::int n from reports where reporter_id=$1`, [s.userId])).toBe(0);
    expect(await n(`select count(*)::int n from auth.session where user_id=$1`, [s.userId])).toBe(0);
    expect(await sessionOf(cookie)).toBeNull();
    expect(await deleteAccount(authPool, s.userId)).toBe(false); // idempotent
  });
});

describe("Google OAuth wiring and feature flags", () => {
  it("without credentials the Google provider is not available", async () => {
    const res = await call("/api/auth/sign-in/social", { method: "POST", body: JSON.stringify({ provider: "google", callbackURL: "/" }) });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
  it("with credentials it builds a correct Google authorisation redirect (code exchange NOT tested: needs real Google credentials)", async () => {
    const withGoogle = createAuth({ env: loadWebEnv({ ...baseEnv, GOOGLE_CLIENT_ID: "test-client-id", GOOGLE_CLIENT_SECRET: "test-secret" }), authPool, email });
    const res = await withGoogle.handler(new Request(BASE + "/api/auth/sign-in/social", { method: "POST", headers: { origin: BASE, "content-type": "application/json" }, body: JSON.stringify({ provider: "google", callbackURL: "/" }) }));
    const body = (await res.json()) as { url?: string };
    const u = new URL(body.url!);
    expect(u.host).toBe("accounts.google.com");
    expect(u.searchParams.get("client_id")).toBe("test-client-id");
    expect(u.searchParams.get("redirect_uri")).toBe(`${BASE}/api/auth/callback/google`);
    expect(u.searchParams.get("state")).toBeTruthy();
  });
  it("guest mode and magic link can be switched off", async () => {
    const off = createAuth({ env: loadWebEnv({ ...baseEnv, GUEST_MODE_ENABLED: "false", MAGIC_LINK_ENABLED: "false" }), authPool, email });
    const a = await off.handler(new Request(BASE + "/api/auth/sign-in/anonymous", { method: "POST", headers: { origin: BASE, "content-type": "application/json" }, body: "{}" }));
    const m = await off.handler(new Request(BASE + "/api/auth/sign-in/magic-link", { method: "POST", headers: { origin: BASE, "content-type": "application/json" }, body: JSON.stringify({ email: "x@example.test" }) }));
    expect(a.status).toBeGreaterThanOrEqual(400);
    expect(m.status).toBeGreaterThanOrEqual(400);
  });
  it("rejects cross-origin state-changing requests that ride an existing session (CSRF)", async () => {
    const g = await call("/api/auth/sign-in/anonymous", { method: "POST", body: "{}" });
    const cookie = jar(g);
    const evil = await auth.handler(new Request(BASE + "/api/auth/sign-out", { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json", cookie }, body: "{}" }));
    expect(evil.status).toBeGreaterThanOrEqual(400);
    expect(await sessionOf(cookie)).not.toBeNull(); // the session survived the forged request
    const ok = await call("/api/auth/sign-out", { method: "POST", body: "{}", cookie });
    expect(ok.status).toBe(200);
    expect(await sessionOf(cookie)).toBeNull(); // same-origin sign-out works
  });
});
