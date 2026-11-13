import { describe, expect, it } from "vitest";
import pg from "pg";
import { classifyHealthError } from "../lib/health";
import { loadWebEnv } from "../lib/env";

describe("health error classification (safe categories only)", () => {
  it("config errors name the invalid SETTINGS outside production, never values", () => {
    let msg = "";
    try { loadWebEnv({ APP_ENV: "staging", DATABASE_URL: "postgres://u:supersecret@h/d", BETTER_AUTH_URL: "https://x.test" }); } catch (e) { msg = String(e); }
    const c = classifyHealthError(new Error(msg.replace(/^Error: /, "")), "staging");
    expect(c.reason).toBe("config");
    expect(c.detail).toMatch(/BETTER_AUTH_SECRET/);
    expect(c.detail).toMatch(/AUTH_DATABASE_URL/);
    expect(JSON.stringify(c)).not.toContain("supersecret");
    expect(classifyHealthError(new Error(msg.replace(/^Error: /, "")), "production").detail).toBeUndefined();
  });
  it("maps database failures to coarse reasons", () => {
    expect(classifyHealthError({ code: "28P01", message: "password authentication failed for user x" }, "staging").reason).toBe("db_auth");
    expect(classifyHealthError({ code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND host" }, "staging").reason).toBe("db_unreachable");
    expect(classifyHealthError({ code: "42P01", message: 'relation "auth.user" does not exist' }, "staging").reason).toBe("db_schema");
    expect(classifyHealthError(new Error("database role \"x\" is privileged"), "staging").reason).toBe("db_role");
    expect(classifyHealthError(new Error("???"), "staging").reason).toBe("unknown");
  });
  it("a REAL wrong-password connection is classified as db_auth and leaks nothing", async () => {
    const u = new URL(process.env.DATABASE_URL!); u.password = "definitely-wrong-password";
    const pool = new pg.Pool({ connectionString: u.toString(), max: 1 });
    let caught: unknown;
    try { await pool.query("select 1"); } catch (e) { caught = e; } finally { await pool.end(); }
    const c = classifyHealthError(caught, "staging");
    expect(c.reason).toBe("db_auth");
    expect(JSON.stringify(c)).not.toContain("definitely-wrong-password");
  });
});
