import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalStorage } from "../src/index.js";

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0]);
const secret = "x".repeat(40);
async function make(now = () => 1_000_000_000_000) {
  const root = await mkdtemp(join(tmpdir(), "chowk-st-"));
  return { root, s: createLocalStorage({ root, secret, baseUrl: "http://localhost/api/media", now }) };
}

describe("local storage adapter (private by default)", () => {
  it("stores, signs and verifies a read URL; expires; detects tampering", async () => {
    let t = 1_000_000_000_000;
    const { root, s } = await make(() => t);
    await s.putPrivate({ key: "photos/u1/a.jpg", body: jpeg, contentType: "image/jpeg", maxBytes: 100 });
    expect((await readFile(join(root, "photos/u1/a.jpg"))).length).toBe(jpeg.length);
    const url = await s.createSignedReadUrl("photos/u1/a.jpg", 60);
    expect(s.verifySignedUrl(url)).toEqual({ key: "photos/u1/a.jpg" });
    expect(s.verifySignedUrl(url.replace("u1", "u2"))).toBeNull();
    t += 61_000;
    expect(s.verifySignedUrl(url)).toBeNull();
  });
  it("rejects oversize, wrong magic bytes, overwrite, and traversal keys", async () => {
    const { s } = await make();
    await expect(s.putPrivate({ key: "photos/u/a.jpg", body: jpeg, contentType: "image/jpeg", maxBytes: 3 })).rejects.toThrow(/maxBytes/);
    await expect(s.putPrivate({ key: "photos/u/b.jpg", body: new Uint8Array([1, 2, 3, 4]), contentType: "image/jpeg", maxBytes: 100 })).rejects.toThrow(/match/);
    await s.putPrivate({ key: "photos/u/c.jpg", body: jpeg, contentType: "image/jpeg", maxBytes: 100 });
    await expect(s.putPrivate({ key: "photos/u/c.jpg", body: jpeg, contentType: "image/jpeg", maxBytes: 100 })).rejects.toThrow();
    for (const k of ["../evil.jpg", "photos/../../x.jpg", "/abs.jpg", "photos/u/a.exe"]) {
      await expect(s.putPrivate({ key: k, body: jpeg, contentType: "image/jpeg", maxBytes: 100 })).rejects.toThrow(/invalid/);
    }
  });
  it("delete removes the object", async () => {
    const { root, s } = await make();
    await s.putPrivate({ key: "photos/u/d.jpg", body: jpeg, contentType: "image/jpeg", maxBytes: 100 });
    await s.delete("photos/u/d.jpg");
    await expect(stat(join(root, "photos/u/d.jpg"))).rejects.toThrow();
  });
});
