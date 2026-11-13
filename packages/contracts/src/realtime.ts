import { z } from "zod";
import { CoarseCell, GeoFix } from "./geo.js";
import { PartyId, QuestRunId, QuestStepId, UserId } from "./ids.js";
import { PartyView } from "./party.js";

/**
 * Colyseus wire contract. Every message is `type` + `payload`; every payload is validated
 * with these schemas on receipt (server for C2S, client in dev + tests for S2C).
 * Protocol version is bumped on any breaking change; see docs/realtime-protocol.md.
 */
export const PROTOCOL_VERSION = 1 as const;

export const ROOM_PARTY = "party" as const;

/** Join options. `accessToken` is a Supabase JWT verified server-side in onAuth. */
export const PartyJoinOptions = z.object({
  protocol: z.literal(PROTOCOL_VERSION),
  accessToken: z.string().min(20).max(4096),
  partyId: PartyId,
});
export type PartyJoinOptions = z.infer<typeof PartyJoinOptions>;

export const ErrorCode = z.enum([
  "bad_request",
  "unauthorized",
  "forbidden",
  "rate_limited",
  "not_in_party",
  "not_leader",
  "run_not_active",
  "step_not_available",
  "verification_failed",
  "protocol_mismatch",
  "internal",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

// ---------- Client -> Server ----------
export const C2S = {
  "location.update": z.object({ fix: GeoFix }),
  "party.ready": z.object({ ready: z.boolean() }),
  "party.kick": z.object({ userId: UserId }),
  "party.leave": z.object({}),
  "run.start": z.object({ questId: z.string().uuid() }),
  "step.verify.geofence": z.object({ runId: QuestRunId, stepId: QuestStepId, fix: GeoFix }),
  "step.verify.code": z.object({ runId: QuestRunId, stepId: QuestStepId, code: z.string().min(4).max(8) }),
  "run.abandon": z.object({ runId: QuestRunId }),
  "ping.emote": z.object({ emote: z.enum(["wave", "here", "wait", "go", "help"]) }),
  "client.heartbeat": z.object({ clientTs: z.number().int() }),
} as const;
export type C2SType = keyof typeof C2S;
export type C2SPayload<T extends C2SType> = z.infer<(typeof C2S)[T]>;

export const C2SEnvelope = z.object({ type: z.enum(Object.keys(C2S) as [C2SType, ...C2SType[]]), payload: z.unknown() });

/** Per-message server-side rate limits (messages per window). Enforced in the room, see protocol doc. */
export const C2S_RATE_LIMITS: Record<C2SType, { max: number; windowMs: number }> = {
  "location.update": { max: 1, windowMs: 2_000 },
  "party.ready": { max: 5, windowMs: 10_000 },
  "party.kick": { max: 3, windowMs: 10_000 },
  "party.leave": { max: 2, windowMs: 10_000 },
  "run.start": { max: 2, windowMs: 30_000 },
  "step.verify.geofence": { max: 6, windowMs: 30_000 },
  "step.verify.code": { max: 5, windowMs: 60_000 },
  "run.abandon": { max: 2, windowMs: 30_000 },
  "ping.emote": { max: 4, windowMs: 10_000 },
  "client.heartbeat": { max: 1, windowMs: 5_000 },
};

// ---------- Server -> Client ----------
export const VerificationOutcome = z.enum(["accepted", "rejected_distance", "rejected_accuracy", "rejected_dwell", "rejected_code", "rejected_suspicious", "pending_review"]);
export type VerificationOutcome = z.infer<typeof VerificationOutcome>;

export const S2C = {
  "party.snapshot": z.object({ party: PartyView }),
  "party.member.cell": z.object({ userId: UserId, cell: CoarseCell.nullable() }),
  "party.member.emote": z.object({ userId: UserId, emote: C2S["ping.emote"].shape.emote }),
  "party.kicked": z.object({ reason: z.enum(["kicked", "disbanded"]) }),
  "run.started": z.object({ runId: QuestRunId, questId: z.string().uuid() }),
  "run.step.advanced": z.object({ runId: QuestRunId, completedStepId: QuestStepId, nextStepId: QuestStepId.nullable() }),
  "run.completed": z.object({ runId: QuestRunId }),
  "run.abandoned": z.object({ runId: QuestRunId }),
  "step.verification": z.object({
    runId: QuestRunId,
    stepId: QuestStepId,
    outcome: VerificationOutcome,
    /** Distance band only, never an exact distance to the target. */
    hint: z.enum(["very_close", "close", "far", "unknown"]).optional(),
    attemptsRemaining: z.number().int().nonnegative().optional(),
  }),
  "server.error": z.object({ code: ErrorCode, message: z.string().max(200), ref: z.string().max(36).optional() }),
  "server.heartbeat": z.object({ serverTs: z.number().int() }),
} as const;
export type S2CType = keyof typeof S2C;
export type S2CPayload<T extends S2CType> = z.infer<(typeof S2C)[T]>;
