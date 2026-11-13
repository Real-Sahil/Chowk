import { z } from "zod";

/** Branded UUID helpers. Brands are compile-time only; runtime is a plain uuid string. */
const uuid = () => z.string().uuid();

export const UserId = uuid().brand<"UserId">();
export const PartyId = uuid().brand<"PartyId">();
export const QuestId = uuid().brand<"QuestId">();
export const QuestStepId = uuid().brand<"QuestStepId">();
export const QuestRunId = uuid().brand<"QuestRunId">();
export const LocationId = uuid().brand<"LocationId">();
export const DistrictId = uuid().brand<"DistrictId">();

export type UserId = z.infer<typeof UserId>;
export type PartyId = z.infer<typeof PartyId>;
export type QuestId = z.infer<typeof QuestId>;
export type QuestStepId = z.infer<typeof QuestStepId>;
export type QuestRunId = z.infer<typeof QuestRunId>;
export type LocationId = z.infer<typeof LocationId>;
export type DistrictId = z.infer<typeof DistrictId>;

/** Human-shareable party join code. Unambiguous alphabet (no 0/O/1/I/L). */
export const PartyJoinCode = z.string().regex(/^[A-HJKMNP-Z2-9]{6}$/, "invalid join code");
export type PartyJoinCode = z.infer<typeof PartyJoinCode>;

export const DisplayName = z
  .string()
  .trim()
  .min(2)
  .max(24)
  .regex(/^[\p{L}\p{N} _.-]+$/u, "letters, numbers, space, _ . - only");
export type DisplayName = z.infer<typeof DisplayName>;
