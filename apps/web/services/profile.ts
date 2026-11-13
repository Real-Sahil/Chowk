import { sql } from "drizzle-orm";
import { CharacterInput, ProfileView, UpdateProfileInput, type UserId } from "@chowk/contracts";
import type { DatabaseAdapter } from "@chowk/ports";

type Exec = { execute(q: ReturnType<typeof sql>): Promise<unknown> };
type Rows = { rows: Record<string, unknown>[] };

/** All access goes through withActor, so RLS (not this code) is the ownership boundary. */
export function createProfileService(db: DatabaseAdapter<Exec>) {
  return {
    async getOwn(userId: UserId): Promise<ProfileView | null> {
      const r = (await db.withActor({ kind: "user", userId }, (tx) =>
        tx.execute(sql`select user_id, display_name, avatar_key, is_guest, share_coarse_location, terms_accepted_at, privacy_accepted_at, location_consent_at, created_at from profiles where user_id = ${userId}`),
      )) as Rows;
      const p = r.rows[0];
      if (!p) return null;
      return ProfileView.parse({
        userId: p.user_id,
        displayName: p.display_name,
        avatarKey: p.avatar_key,
        isGuest: p.is_guest,
        shareCoarseLocation: p.share_coarse_location,
        termsAccepted: p.terms_accepted_at != null,
        privacyAccepted: p.privacy_accepted_at != null,
        locationConsent: p.location_consent_at != null,
        createdAt: new Date(p.created_at as string).toISOString(),
      });
    },

    /** Profile creation/update + consent capture. Consent timestamps are set by the server clock (never client-supplied). */
    async update(userId: UserId, raw: unknown): Promise<ProfileView> {
      const input = UpdateProfileInput.parse(raw);
      await db.withActor({ kind: "user", userId }, async (tx) => {
        const sets: ReturnType<typeof sql>[] = [];
        if (input.displayName !== undefined) sets.push(sql`display_name = ${input.displayName}`);
        if (input.avatarKey !== undefined) sets.push(sql`avatar_key = ${input.avatarKey}`);
        if (input.shareCoarseLocation !== undefined) sets.push(sql`share_coarse_location = ${input.shareCoarseLocation}`);
        if (input.acceptTerms) sets.push(sql`terms_version = ${input.acceptTerms.version}, terms_accepted_at = now()`);
        if (input.acceptPrivacy) sets.push(sql`privacy_version = ${input.acceptPrivacy.version}, privacy_accepted_at = now()`);
        if (input.locationConsent !== undefined) sets.push(input.locationConsent ? sql`location_consent_at = now()` : sql`location_consent_at = null`);
        if (input.partyLocationConsent !== undefined) sets.push(input.partyLocationConsent ? sql`party_location_consent_at = now()` : sql`party_location_consent_at = null`);
        if (input.analyticsConsent !== undefined) sets.push(sql`analytics_consent = ${input.analyticsConsent}`);
        if (sets.length === 0) return;
        await tx.execute(sql`update profiles set ${sql.join(sets, sql`, `)}, last_seen_at = now() where user_id = ${userId}`);
      });
      const p = await this.getOwn(userId);
      if (!p) throw new Error("profile missing");
      return p;
    },

    async upsertCharacter(userId: UserId, raw: unknown): Promise<void> {
      const c = CharacterInput.parse(raw);
      await db.withActor({ kind: "user", userId }, (tx) =>
        tx.execute(sql`insert into characters(user_id, name, story, appearance) values (${userId}, ${c.name}, ${c.story}, ${JSON.stringify(c.appearance)}::jsonb)
                       on conflict (user_id) do update set name = excluded.name, story = excluded.story, appearance = excluded.appearance`),
      );
    },

    async getCharacter(userId: UserId): Promise<{ name: string; story: string; appearance: unknown } | null> {
      const r = (await db.withActor({ kind: "user", userId }, (tx) => tx.execute(sql`select name, story, appearance from characters where user_id = ${userId}`))) as Rows;
      const c = r.rows[0];
      return c ? { name: String(c.name), story: String(c.story), appearance: c.appearance } : null;
    },
  };
}
