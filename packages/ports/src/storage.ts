/**
 * Replaceable object-storage port. Objects are PRIVATE by default; reads happen only through
 * short-lived signed URLs minted AFTER the server checked ownership/moderation state in Postgres.
 */
export interface PutPrivateInput {
  /** Server-generated key, e.g. `photos/<userId>/<uuid>.jpg`. Never client-chosen. */
  readonly key: string;
  readonly body: Uint8Array;
  readonly contentType: "image/jpeg" | "image/png" | "image/webp";
  /** Hard cap enforced by the adapter regardless of caller. */
  readonly maxBytes: number;
}

export interface StorageAdapter {
  putPrivate(input: PutPrivateInput): Promise<void>;
  createSignedReadUrl(key: string, ttlSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
}
