import { z } from "zod";
import { DisplayName, UserId } from "./ids.js";

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

export const UpdateProfileInput = z.object({
  displayName: DisplayName.optional(),
  avatarKey: z.enum(["placeholder-a", "placeholder-b", "placeholder-c", "placeholder-d"]).optional(),
  shareCoarseLocationWithParty: z.boolean().optional(),
});
export type UpdateProfileInput = z.infer<typeof UpdateProfileInput>;

export const UpgradeGuestInput = z.object({ email: z.string().email().max(254) });
export type UpgradeGuestInput = z.infer<typeof UpgradeGuestInput>;
