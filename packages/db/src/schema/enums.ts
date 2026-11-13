import { pgEnum } from "drizzle-orm/pg-core";

export const provenance = pgEnum("provenance", ["placeholder", "reviewed"]);
export const accountRole = pgEnum("account_role", ["player", "moderator", "admin"]);
export const accountStatus = pgEnum("account_status", ["active", "suspended", "deleted_pending"]);
export const placeKind = pgEnum("place_kind", ["food", "maker", "market", "landmark", "square"]);
export const difficulty = pgEnum("quest_difficulty", ["easy", "medium", "hard"]);
export const questStatus = pgEnum("quest_status", ["draft", "playtest", "published", "retired"]);
export const verificationMethod = pgEnum("verification_method", ["gps", "qr", "photo", "narrative"]);
export const stepStatus = pgEnum("step_status", ["locked", "available", "pending", "completed"]);
export const verifyOutcome = pgEnum("verify_outcome", [
  "accepted",
  "rejected_distance",
  "rejected_accuracy",
  "rejected_dwell",
  "rejected_code",
  "rejected_expired",
  "rejected_suspicious",
  "pending_review",
]);
export const badgeScope = pgEnum("badge_scope", ["individual", "party"]);
export const partyStatus = pgEnum("party_status", ["forming", "in_run", "disbanded"]);
export const partyRole = pgEnum("party_role", ["leader", "member"]);
export const invitationStatus = pgEnum("invitation_status", ["pending", "accepted", "rejected", "expired", "revoked"]);
export const blockKind = pgEnum("block_kind", ["block", "mute"]);
export const reportKind = pgEnum("report_kind", [
  "harassment",
  "impersonation",
  "spam",
  "safety",
  "inappropriate_content",
  "inaccurate_content",
  "cheating",
  "other",
]);
export const reportStatus = pgEnum("report_status", ["open", "triaged", "closed"]);
export const submissionKind = pgEnum("submission_kind", ["person", "place", "business", "story", "quest_idea"]);
export const subjectConsent = pgEnum("subject_consent", ["not_applicable", "pending", "obtained", "refused"]);
export const reviewStatus = pgEnum("review_status", ["pending", "approved", "rejected"]);
export const moderationActionType = pgEnum("moderation_action_type", [
  "warn",
  "suspend",
  "unsuspend",
  "approve",
  "reject",
  "remove_content",
  "role_change",
]);
