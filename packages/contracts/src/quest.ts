import { z } from "zod";
import { LocationId, QuestId, QuestRunId, QuestStepId, PartyId } from "./ids.js";
import { Latitude, Longitude as _Lng } from "./geo.js";

/** Every piece of seed content must carry this. Enforced in DB + CI (docs/security.md, CONTENT-1). */
export const ContentProvenance = z.enum(["placeholder", "reviewed"]);
export type ContentProvenance = z.infer<typeof ContentProvenance>;

export const StepType = z.enum(["geofence", "site_code", "party_sync", "narrative"]);
export type StepType = z.infer<typeof StepType>;

const StepBase = z.object({
  id: QuestStepId,
  ordinal: z.number().int().nonnegative(),
  title: z.string().min(1).max(80),
  body: z.string().max(600),
  locationId: LocationId.nullable(),
});

export const GeofenceStepConfig = z.object({
  type: z.literal("geofence"),
  radiusM: z.number().min(15).max(150),
  maxAccuracyM: z.number().min(5).max(60).default(40),
  minDwellSec: z.number().int().min(0).max(120).default(10),
});
export const SiteCodeStepConfig = z.object({
  type: z.literal("site_code"),
  /** Code is stored hashed server-side; this schema only describes the player-facing shape. */
  codeLength: z.number().int().min(4).max(8),
  maxAttempts: z.number().int().min(3).max(10).default(5),
});
export const PartySyncStepConfig = z.object({
  type: z.literal("party_sync"),
  minMembersPresent: z.number().int().min(2).max(6),
  radiusM: z.number().min(20).max(200),
  windowSec: z.number().int().min(10).max(120).default(30),
});
export const NarrativeStepConfig = z.object({ type: z.literal("narrative") });

export const StepConfig = z.discriminatedUnion("type", [
  GeofenceStepConfig,
  SiteCodeStepConfig,
  PartySyncStepConfig,
  NarrativeStepConfig,
]);
export type StepConfig = z.infer<typeof StepConfig>;

export const QuestStep = StepBase.extend({ config: StepConfig });
export type QuestStep = z.infer<typeof QuestStep>;

export const QuestSummary = z.object({
  id: QuestId,
  slug: z.string().regex(/^[a-z0-9-]{3,60}$/),
  title: z.string().min(1).max(80),
  blurb: z.string().max(280),
  provenance: ContentProvenance,
  minPartySize: z.number().int().min(1).max(6),
  maxPartySize: z.number().int().min(1).max(6),
  estMinutes: z.number().int().min(5).max(240),
  stepCount: z.number().int().positive(),
  /** Safety metadata surfaced before a run starts. */
  daylightOnly: z.boolean(),
});
export type QuestSummary = z.infer<typeof QuestSummary>;

export const QuestRunStatus = z.enum(["active", "completed", "abandoned", "expired"]);
export type QuestRunStatus = z.infer<typeof QuestRunStatus>;

export const StepProgressStatus = z.enum(["locked", "available", "verifying", "completed"]);
export type StepProgressStatus = z.infer<typeof StepProgressStatus>;

export const QuestRunView = z.object({
  id: QuestRunId,
  questId: QuestId,
  partyId: PartyId.nullable(),
  status: QuestRunStatus,
  currentStepOrdinal: z.number().int().nonnegative(),
  steps: z.array(z.object({ stepId: QuestStepId, status: StepProgressStatus })),
  startedAt: z.string().datetime(),
});
export type QuestRunView = z.infer<typeof QuestRunView>;

/** Authoring format for content/placeholder/*.json, validated in CI. Coordinates are authoring-time only. */
export const QuestContentFile = z.object({
  provenance: ContentProvenance,
  slug: z.string(),
  title: z.string(),
  blurb: z.string(),
  locations: z.array(
    z.object({ key: z.string(), name: z.string(), lat: Latitude, lng: _Lng, isPublicSpace: z.literal(true) }),
  ),
  steps: z.array(z.object({ locationKey: z.string().nullable(), title: z.string(), body: z.string(), config: StepConfig })),
});
export type QuestContentFile = z.infer<typeof QuestContentFile>;

