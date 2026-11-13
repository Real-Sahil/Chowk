import { z } from "zod";
import { GeoFix } from "./geo";
import { QuestId, QuestRunId, QuestStepId } from "./ids";

/**
 * HTTP contracts for privileged game operations. These run in Next.js server routes (NOT in Colyseus):
 * the server validates, writes to Postgres under RLS/SECURITY DEFINER functions, and returns the result.
 */
export const VerificationOutcome = z.enum([
  "accepted",
  "rejected_distance",
  "rejected_accuracy",
  "rejected_dwell",
  "rejected_code",
  "rejected_suspicious",
  "pending_review",
]);
export type VerificationOutcome = z.infer<typeof VerificationOutcome>;

export const StartRunInput = z.object({ questId: QuestId, partyId: z.string().uuid().optional() });
export type StartRunInput = z.infer<typeof StartRunInput>;

/** `attemptNonce` is client-generated and makes retries idempotent (replay protection, unique per step). */
export const VerifyGeofenceInput = z.object({
  runId: QuestRunId,
  stepId: QuestStepId,
  fix: GeoFix,
  attemptNonce: z.string().uuid(),
});
export const VerifyCodeInput = z.object({
  runId: QuestRunId,
  stepId: QuestStepId,
  code: z.string().min(4).max(8),
  attemptNonce: z.string().uuid(),
});

export const VerificationResult = z.object({
  runId: QuestRunId,
  stepId: QuestStepId,
  outcome: VerificationOutcome,
  /** Distance band only, never metres. */
  hint: z.enum(["very_close", "close", "far", "unknown"]).optional(),
  attemptsRemaining: z.number().int().nonnegative().optional(),
  nextStepId: QuestStepId.nullable().optional(),
  runCompleted: z.boolean().optional(),
});
export type VerificationResult = z.infer<typeof VerificationResult>;
