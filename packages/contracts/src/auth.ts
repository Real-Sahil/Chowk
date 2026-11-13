import { z } from "zod";
import { DisplayName, UserId } from "./ids";

export const SessionKind = z.enum(["guest", "member"]);
export type SessionKind = z.infer<typeof SessionKind>;

/** Subset of verified JWT claims the apps rely on. Verified server-side only. */
export const VerifiedClaims = z.object({
  sub: UserId,
  isAnonymous: z.boolean(),
  exp: z.number().int(),
});
export type VerifiedClaims = z.infer<typeof VerifiedClaims>;

export const ConsentKind = z.enum([
  "terms",
  "privacy",
  "location_foreground",
  "party_location_sharing",
  "analytics",
]);
export type ConsentKind = z.infer<typeof ConsentKind>;

export const RecordConsentInput = z.object({
  kind: ConsentKind,
  granted: z.boolean(),
  policyVersion: z.string().min(1).max(32),
});
export type RecordConsentInput = z.infer<typeof RecordConsentInput>;

export const AVATAR_KEYS = ["terracotta", "teal", "saffron", "indigo", "cream", "placeholder-a"] as const;
export const AvatarKey = z.enum(AVATAR_KEYS);

/** Consent is recorded as timestamps server-side; the client only says what the user chose. */
export const UpdateProfileInput = z
  .object({
    displayName: DisplayName,
    avatarKey: AvatarKey,
    shareCoarseLocation: z.boolean(),
    acceptTerms: z.object({ version: z.string().min(1).max(32) }),
    acceptPrivacy: z.object({ version: z.string().min(1).max(32) }),
    locationConsent: z.boolean(),
    partyLocationConsent: z.boolean(),
    analyticsConsent: z.boolean(),
  })
  .partial()
  .strict();
export type UpdateProfileInput = z.infer<typeof UpdateProfileInput>;

export const UpgradeGuestInput = z.object({ email: z.string().email().max(254) });
export type UpgradeGuestInput = z.infer<typeof UpgradeGuestInput>;

export const CharacterInput = z
  .object({
    name: z.string().trim().min(2).max(32),
    story: z.string().trim().max(600).default(""),
    appearance: z
      .object({
        skin: z.enum(["tone-1", "tone-2", "tone-3", "tone-4", "tone-5"]),
        outfit: z.enum(["terracotta", "teal", "saffron", "indigo", "cream"]),
        accessory: z.enum(["none", "cap", "scarf", "glasses"]),
      })
      .strict(),
  })
  .strict();
export type CharacterInput = z.infer<typeof CharacterInput>;

export const ProfileView = z.object({
  userId: UserId,
  displayName: z.string(),
  avatarKey: z.string(),
  isGuest: z.boolean(),
  shareCoarseLocation: z.boolean(),
  termsAccepted: z.boolean(),
  privacyAccepted: z.boolean(),
  locationConsent: z.boolean(),
  createdAt: z.string(),
});
export type ProfileView = z.infer<typeof ProfileView>;
