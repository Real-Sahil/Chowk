import { z } from "zod";
import { DisplayName, PartyId, PartyJoinCode, UserId } from "./ids.js";

export const PartyStatus = z.enum(["forming", "in_run", "disbanded"]);
export type PartyStatus = z.infer<typeof PartyStatus>;
export const PartyRole = z.enum(["leader", "member"]);
export type PartyRole = z.infer<typeof PartyRole>;

export const PARTY_MAX_SIZE = 6;

export const PartyMemberView = z.object({
  userId: UserId,
  displayName: DisplayName,
  role: PartyRole,
  ready: z.boolean(),
  connected: z.boolean(),
});
export type PartyMemberView = z.infer<typeof PartyMemberView>;

export const PartyView = z.object({
  id: PartyId,
  status: PartyStatus,
  joinCode: PartyJoinCode,
  joinCodeExpiresAt: z.string().datetime(),
  maxSize: z.number().int().min(2).max(PARTY_MAX_SIZE),
  members: z.array(PartyMemberView).min(1).max(PARTY_MAX_SIZE),
});
export type PartyView = z.infer<typeof PartyView>;

export const CreatePartyInput = z.object({ maxSize: z.number().int().min(2).max(PARTY_MAX_SIZE).default(4) });
export const JoinPartyInput = z.object({ joinCode: PartyJoinCode });
export const KickMemberInput = z.object({ userId: UserId });
