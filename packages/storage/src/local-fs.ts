import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import type { PutPrivateInput, StorageAdapter } from "@chowk/ports";

const KEY_RE = /^[a-z0-9][a-z0-9/_-]{0,200}\.(jpg|png|webp)$/;
const MAGIC: Record<PutPrivateInput["contentType"], (b: Uint8Array) => boolean> = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  "image/webp": (b) => b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45,
};

export interface LocalStorageOptions {
  root: string;
  /** HMAC secret for signed read URLs (>= 32 chars). */
  secret: string;
  /** Public base of the route that serves signed reads, e.g. http://localhost:3000/api/media */
  baseUrl: string;
  now?: () => number;
}

/** DEV/TEST storage on local disk. Same contract as the production adapters; never use on ephemeral free hosts. */
export function createLocalStorage(opts: LocalStorageOptions): StorageAdapter & {
  verifySignedUrl(url: string): { key: string } | null;
} {
  if (opts.secret.length < 32) throw new Error("storage secret must be >= 32 characters");
  const now = opts.now ?? Date.now;
  const root = resolve(opts.root);
  const pathFor = (key: string) => {
    if (!KEY_RE.test(key) || key.includes("..")) throw new Error("invalid storage key");
    const p = resolve(root, key);
    if (!p.startsWith(root + sep)) throw new Error("path escape");
    return p;
  };
  const sign = (key: string, exp: number) => createHmac("sha256", opts.secret).update(`${key}\n${exp}`).digest("base64url");

  return {
    async putPrivate({ key, body, contentType, maxBytes }) {
      if (body.byteLength > maxBytes) throw new Error("object exceeds maxBytes");
      if (!MAGIC[contentType](body)) throw new Error("content does not match declared type");
      const p = pathFor(key);
      await mkdir(dirname(p), { recursive: true });
      await writeFile(p, body, { flag: "wx" }); // never overwrite
    },
    async createSignedReadUrl(key, ttlSeconds) {
      pathFor(key);
      const exp = Math.floor(now() / 1000) + Math.min(Math.max(ttlSeconds, 1), 900);
      return `${opts.baseUrl}?key=${encodeURIComponent(key)}&exp=${exp}&sig=${sign(key, exp)}`;
    },
    async delete(key) {
      await rm(pathFor(key), { force: true });
    },
    verifySignedUrl(url) {
      const u = new URL(url);
      const key = u.searchParams.get("key") ?? "";
      const exp = Number(u.searchParams.get("exp"));
      const sig = u.searchParams.get("sig") ?? "";
      if (!KEY_RE.test(key) || !Number.isFinite(exp) || exp * 1000 < now()) return null;
      const a = Buffer.from(sig), b = Buffer.from(sign(key, exp));
      return a.length === b.length && timingSafeEqual(a, b) ? { key } : null;
    },
  };
}
