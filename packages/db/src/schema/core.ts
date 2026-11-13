import { sql } from "drizzle-orm";
import {
  boolean, check, doublePrecision, index, integer, jsonb, pgTable, primaryKey, smallint, text,
  time, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";
import { authUser } from "./auth";
import * as e from "./enums";

const ts = (name: string) => timestamp(name, { withTimezone: true });
const tsNow = (name: string) => ts(name).notNull().defaultNow();
const createdAt = () => tsNow("created_at");
const userFk = (name = "user_id") => uuid(name).notNull().references(() => authUser.id, { onDelete: "cascade" });

// ───────────────────────── identity ─────────────────────────
export const profiles = pgTable(
  "profiles",
  {
    userId: uuid("user_id").primaryKey().references(() => authUser.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    avatarKey: text("avatar_key").notNull().default("placeholder-a"),
    /** NOT writable by chowk_app: only SECURITY DEFINER functions change it. */
    role: e.accountRole("role").notNull().default("player"),
    status: e.accountStatus("status").notNull().default("active"),
    isGuest: boolean("is_guest").notNull().default(true),
    shareCoarseLocation: boolean("share_coarse_location").notNull().default(false),
    // consent fields (timestamps + policy versions; null = not given)
    termsVersion: text("terms_version"),
    termsAcceptedAt: ts("terms_accepted_at"),
    privacyVersion: text("privacy_version"),
    privacyAcceptedAt: ts("privacy_accepted_at"),
    locationConsentAt: ts("location_consent_at"),
    partyLocationConsentAt: ts("party_location_consent_at"),
    analyticsConsent: boolean("analytics_consent").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: tsNow("updated_at"),
    lastSeenAt: tsNow("last_seen_at"),
  },
  (t) => [
    check("profiles_display_name_len", sql`char_length(${t.displayName}) between 2 and 24`),
    index("profiles_role_idx").on(t.role),
  ],
);

export const characters = pgTable(
  "characters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userFk(),
    name: text("name").notNull(),
    /** Whitelisted keys, validated by Zod before write. */
    appearance: jsonb("appearance").notNull().default(sql`'{}'::jsonb`),
    story: text("story").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: tsNow("updated_at"),
  },
  (t) => [
    uniqueIndex("characters_one_per_user").on(t.userId),
    check("characters_name_len", sql`char_length(${t.name}) between 2 and 32`),
    check("characters_story_len", sql`char_length(${t.story}) <= 600`),
  ],
);

// ───────────────────────── world & content ─────────────────────────
export const places = pgTable(
  "places",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    kind: e.placeKind("kind").notNull(),
    /** Coarse area label only (e.g. a district), never a street address. */
    district: text("district").notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    geofenceRadiusM: smallint("geofence_radius_m").notNull().default(40),
    /** {"mon":[["09:00","17:00"]], ...} validated by Zod; empty = always accessible (public space). */
    openingHours: jsonb("opening_hours").notNull().default(sql`'{}'::jsonb`),
    accessibilityNotes: text("accessibility_notes").notNull().default(""),
    safetyNotes: text("safety_notes").notNull().default(""),
    isPublicSpace: boolean("is_public_space").notNull().default(true),
    /** Coordinates are synthetic (not a claim about a real location). */
    isSynthetic: boolean("is_synthetic").notNull().default(true),
    provenance: e.provenance("provenance").notNull().default("placeholder"),
    consentBasis: text("consent_basis").notNull().default("none"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    check("places_lat", sql`${t.lat} between -90 and 90`),
    check("places_lng", sql`${t.lng} between -180 and 180`),
    check("places_radius", sql`${t.geofenceRadiusM} between 15 and 150`),
    check("places_public_only", sql`${t.isPublicSpace}`),
    check("places_consent_basis", sql`${t.consentBasis} in ('none','owner_consent','public_landmark')`),
    index("places_district_idx").on(t.district),
  ],
);

export const badges = pgTable(
  "badges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    scope: e.badgeScope("scope").notNull().default("individual"),
    artKey: text("art_key").notNull().default("placeholder"),
    provenance: e.provenance("provenance").notNull().default("placeholder"),
    createdAt: createdAt(),
  },
);

export const quests = pgTable(
  "quests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    difficulty: e.difficulty("difficulty").notNull().default("easy"),
    estimatedMinutes: smallint("estimated_minutes").notNull(),
    rewardXp: integer("reward_xp").notNull().default(0),
    rewardBadgeId: uuid("reward_badge_id").references(() => badges.id),
    minPartySize: smallint("min_party_size").notNull().default(1),
    maxPartySize: smallint("max_party_size").notNull().default(4),
    daylightOnly: boolean("daylight_only").notNull().default(true),
    /** Time-bound availability (e.g. Night Market). Local time in `timezone`. null = always. */
    windowStart: time("window_start"),
    windowEnd: time("window_end"),
    timezone: text("timezone").notNull().default("Asia/Karachi"),
    provenance: e.provenance("provenance").notNull().default("placeholder"),
    status: e.questStatus("status").notNull().default("draft"),
    contentVersion: integer("content_version").notNull().default(1),
    reviewedBy: uuid("reviewed_by").references(() => authUser.id, { onDelete: "set null" }),
    reviewedAt: ts("reviewed_at"),
    createdAt: createdAt(),
  },
  (t) => [
    check("quests_party_bounds", sql`${t.minPartySize} between 1 and 6 and ${t.maxPartySize} between ${t.minPartySize} and 6`),
    check("quests_minutes", sql`${t.estimatedMinutes} between 5 and 240`),
    check("quests_xp", sql`${t.rewardXp} >= 0`),
    check("quests_window_pair", sql`(${t.windowStart} is null) = (${t.windowEnd} is null)`),
    // CONTENT-1: placeholder content can never be published; published requires a recorded review.
    check("quests_placeholder_never_published", sql`${t.provenance} = 'reviewed' or ${t.status} in ('draft','playtest')`),
    check("quests_published_reviewed", sql`${t.status} <> 'published' or (${t.reviewedBy} is not null and ${t.reviewedAt} is not null)`),
  ],
);

export const questSteps = pgTable(
  "quest_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    questId: uuid("quest_id").notNull().references(() => quests.id, { onDelete: "cascade" }),
    ordinal: smallint("ordinal").notNull(),
    placeId: uuid("place_id").references(() => places.id),
    title: text("title").notNull(),
    clue: text("clue").notNull().default(""),
    storyUnlock: text("story_unlock").notNull().default(""),
    verificationMethod: e.verificationMethod("verification_method").notNull(),
    /** Per-method options (Zod-validated), e.g. {"minDwellSec":10} or {"qrTtlSeconds":900}. */
    config: jsonb("config").notNull().default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("quest_steps_order").on(t.questId, t.ordinal),
    check("quest_steps_ordinal", sql`${t.ordinal} >= 0`),
    // gps/qr/photo need a place to verify at; narrative steps do not
    check("quest_steps_place_required", sql`${t.verificationMethod} = 'narrative' or ${t.placeId} is not null`),
  ],
);

/** Secrets for steps. chowk_app has NO privileges on this table; read only inside SECURITY DEFINER functions. */
export const questStepSecrets = pgTable("quest_step_secrets", {
  stepId: uuid("step_id").primaryKey().references(() => questSteps.id, { onDelete: "cascade" }),
  qrSecretHash: text("qr_secret_hash").notNull(),
});

// ───────────────────────── parties ─────────────────────────
export const parties = pgTable(
  "parties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leaderId: userFk("leader_id"),
    status: e.partyStatus("status").notNull().default("forming"),
    maxSize: smallint("max_size").notNull().default(4),
    createdAt: createdAt(),
    disbandedAt: ts("disbanded_at"),
  },
  (t) => [check("parties_size", sql`${t.maxSize} between 2 and 6`)],
);

export const partyMembers = pgTable(
  "party_members",
  {
    partyId: uuid("party_id").notNull().references(() => parties.id, { onDelete: "cascade" }),
    userId: userFk(),
    role: e.partyRole("role").notNull().default("member"),
    /** Consent: sharing coarse location with this party. Default OFF. */
    sharesLocation: boolean("shares_location").notNull().default(false),
    joinedAt: tsNow("joined_at"),
    leftAt: ts("left_at"),
  },
  (t) => [
    primaryKey({ columns: [t.partyId, t.userId] }),
    // one LIVE party per user
    uniqueIndex("party_members_one_live").on(t.userId).where(sql`${t.leftAt} is null`),
  ],
);

export const partyInvitations = pgTable(
  "party_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    partyId: uuid("party_id").notNull().references(() => parties.id, { onDelete: "cascade" }),
    inviterId: userFk("inviter_id"),
    inviteeId: userFk("invitee_id"),
    status: e.invitationStatus("status").notNull().default("pending"),
    expiresAt: ts("expires_at").notNull().default(sql`now() + interval '30 minutes'`),
    createdAt: createdAt(),
    respondedAt: ts("responded_at"),
  },
  (t) => [
    check("invitations_not_self", sql`${t.inviterId} <> ${t.inviteeId}`),
    uniqueIndex("invitations_one_pending").on(t.partyId, t.inviteeId).where(sql`${t.status} = 'pending'`),
    index("invitations_invitee_idx").on(t.inviteeId, t.status),
  ],
);

// ───────────────────────── play ─────────────────────────
export const questStepProgress = pgTable(
  "quest_step_progress",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userFk(),
    questId: uuid("quest_id").notNull().references(() => quests.id, { onDelete: "cascade" }),
    stepId: uuid("step_id").notNull().references(() => questSteps.id, { onDelete: "cascade" }),
    partyId: uuid("party_id").references(() => parties.id, { onDelete: "set null" }),
    status: e.stepStatus("status").notNull().default("locked"),
    contentVersion: integer("content_version").notNull().default(1),
    completedAt: ts("completed_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("progress_user_step").on(t.userId, t.stepId),
    index("progress_user_quest_idx").on(t.userId, t.questId),
    check("progress_completed_at", sql`(${t.status} = 'completed') = (${t.completedAt} is not null)`),
  ],
);

export const verificationAttempts = pgTable(
  "verification_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    progressId: uuid("progress_id").notNull().references(() => questStepProgress.id, { onDelete: "cascade" }),
    userId: userFk(),
    method: e.verificationMethod("method").notNull(),
    outcome: e.verifyOutcome("outcome").notNull(),
    /** Band only, never metres. NO coordinates are stored anywhere. */
    distanceBand: text("distance_band"),
    accuracyM: smallint("accuracy_m"),
    coarseDistrict: text("coarse_district"),
    /** Replay protection: client nonce unique per progress row; QR token id unique globally (single use). */
    attemptNonce: uuid("attempt_nonce").notNull(),
    qrJti: text("qr_jti"),
    reasonFlags: text("reason_flags").array().notNull().default(sql`'{}'::text[]`),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("attempts_nonce").on(t.progressId, t.attemptNonce),
    uniqueIndex("attempts_qr_jti").on(t.qrJti).where(sql`${t.qrJti} is not null`),
    index("attempts_created_idx").on(t.createdAt),
    check("attempts_band", sql`${t.distanceBand} is null or ${t.distanceBand} in ('very_close','close','far','unknown')`),
  ],
);

export const questCompletions = pgTable(
  "quest_completions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userFk(),
    questId: uuid("quest_id").notNull().references(() => quests.id, { onDelete: "cascade" }),
    partyId: uuid("party_id").references(() => parties.id, { onDelete: "set null" }),
    contentVersion: integer("content_version").notNull().default(1),
    completedAt: tsNow("completed_at"),
  },
  // exactly-once completion per user per quest
  (t) => [uniqueIndex("completions_user_quest").on(t.userId, t.questId)],
);

export const userBadges = pgTable(
  "user_badges",
  {
    userId: userFk(),
    badgeId: uuid("badge_id").notNull().references(() => badges.id, { onDelete: "cascade" }),
    questId: uuid("quest_id").references(() => quests.id, { onDelete: "set null" }),
    partyId: uuid("party_id").references(() => parties.id, { onDelete: "set null" }),
    issuedAt: tsNow("issued_at"),
  },
  // duplicate rewards are structurally impossible
  (t) => [primaryKey({ columns: [t.userId, t.badgeId] })],
);

// ───────────────────────── social & safety ─────────────────────────
export const blocks = pgTable(
  "blocks",
  {
    blockerId: userFk("blocker_id"),
    blockedId: userFk("blocked_id"),
    kind: e.blockKind("kind").notNull().default("block"),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.blockerId, t.blockedId] }),
    check("blocks_not_self", sql`${t.blockerId} <> ${t.blockedId}`),
    index("blocks_blocked_idx").on(t.blockedId),
  ],
);

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reporterId: userFk("reporter_id"),
    subjectUserId: uuid("subject_user_id").references(() => authUser.id, { onDelete: "set null" }),
    subjectPartyId: uuid("subject_party_id").references(() => parties.id, { onDelete: "set null" }),
    subjectPlaceId: uuid("subject_place_id").references(() => places.id, { onDelete: "set null" }),
    kind: e.reportKind("kind").notNull(),
    detail: text("detail").notNull().default(""),
    status: e.reportStatus("status").notNull().default("open"),
    createdAt: createdAt(),
  },
  (t) => [
    check("reports_detail_len", sql`char_length(${t.detail}) <= 500`),
    // NOTE: no "must have a subject" CHECK - FK SET NULL on account deletion would otherwise block deleting a reported user. The API validates the subject.
    index("reports_status_idx").on(t.status, t.createdAt),
  ],
);

export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    submitterId: userFk("submitter_id"),
    kind: e.submissionKind("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    subjectConsent: e.subjectConsent("subject_consent").notNull().default("not_applicable"),
    /** Set by a moderator if the text contains a home address / private workplace; such submissions can never be approved. */
    containsPrivateAddress: boolean("contains_private_address").notNull().default(false),
    status: e.reviewStatus("status").notNull().default("pending"),
    reviewedBy: uuid("reviewed_by").references(() => authUser.id, { onDelete: "set null" }),
    reviewedAt: ts("reviewed_at"),
    createdAt: createdAt(),
  },
  (t) => [
    check("submissions_len", sql`char_length(${t.title}) between 3 and 120 and char_length(${t.body}) between 10 and 2000`),
    // A real person can only be approved with documented consent; private addresses can never be approved.
    check("submissions_person_consent", sql`${t.status} <> 'approved' or ${t.kind} <> 'person' or ${t.subjectConsent} = 'obtained'`),
    check("submissions_no_private_address", sql`${t.status} <> 'approved' or not ${t.containsPrivateAddress}`),
    check("submissions_review_fields", sql`${t.status} = 'pending' or (${t.reviewedBy} is not null and ${t.reviewedAt} is not null)`),
    index("submissions_status_idx").on(t.status, t.createdAt),
  ],
);

export const photoReviews = pgTable(
  "photo_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attemptId: uuid("attempt_id").references(() => verificationAttempts.id, { onDelete: "set null" }),
    ownerId: userFk("owner_id"),
    /** Private object key (server-generated). Never a public URL. */
    storageKey: text("storage_key").notNull().unique(),
    status: e.reviewStatus("status").notNull().default("pending"),
    reviewerId: uuid("reviewer_id").references(() => authUser.id, { onDelete: "set null" }),
    reviewedAt: ts("reviewed_at"),
    reason: text("reason"),
    /** Never auto-published: stays false unless the owner opts in AND a moderator approved. */
    published: boolean("published").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    check("photo_published_needs_approval", sql`not ${t.published} or ${t.status} = 'approved'`),
    check("photo_review_fields", sql`${t.status} = 'pending' or (${t.reviewerId} is not null and ${t.reviewedAt} is not null)`),
    index("photo_reviews_status_idx").on(t.status, t.createdAt),
  ],
);

export const moderationActions = pgTable(
  "moderation_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** SET NULL on actor deletion keeps the audit trail. */
    actorId: uuid("actor_id").references(() => authUser.id, { onDelete: "set null" }),
    action: e.moderationActionType("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id"),
    reason: text("reason").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [
    check("mod_target_type", sql`${t.targetType} in ('user','report','submission','photo_review','quest','badge','place')`),
    index("mod_actions_target_idx").on(t.targetType, t.targetId),
  ],
);
