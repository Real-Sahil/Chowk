CREATE SCHEMA "auth";
--> statement-breakpoint
CREATE TYPE "public"."account_role" AS ENUM('player', 'moderator', 'admin');--> statement-breakpoint
CREATE TYPE "public"."account_status" AS ENUM('active', 'suspended', 'deleted_pending');--> statement-breakpoint
CREATE TYPE "public"."badge_scope" AS ENUM('individual', 'party');--> statement-breakpoint
CREATE TYPE "public"."block_kind" AS ENUM('block', 'mute');--> statement-breakpoint
CREATE TYPE "public"."quest_difficulty" AS ENUM('easy', 'medium', 'hard');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'rejected', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."moderation_action_type" AS ENUM('warn', 'suspend', 'unsuspend', 'approve', 'reject', 'remove_content', 'role_change');--> statement-breakpoint
CREATE TYPE "public"."party_role" AS ENUM('leader', 'member');--> statement-breakpoint
CREATE TYPE "public"."party_status" AS ENUM('forming', 'in_run', 'disbanded');--> statement-breakpoint
CREATE TYPE "public"."place_kind" AS ENUM('food', 'maker', 'market', 'landmark', 'square');--> statement-breakpoint
CREATE TYPE "public"."provenance" AS ENUM('placeholder', 'reviewed');--> statement-breakpoint
CREATE TYPE "public"."quest_status" AS ENUM('draft', 'playtest', 'published', 'retired');--> statement-breakpoint
CREATE TYPE "public"."report_kind" AS ENUM('harassment', 'impersonation', 'spam', 'safety', 'inappropriate_content', 'inaccurate_content', 'cheating', 'other');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('open', 'triaged', 'closed');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."step_status" AS ENUM('locked', 'available', 'pending', 'completed');--> statement-breakpoint
CREATE TYPE "public"."subject_consent" AS ENUM('not_applicable', 'pending', 'obtained', 'refused');--> statement-breakpoint
CREATE TYPE "public"."submission_kind" AS ENUM('person', 'place', 'business', 'story', 'quest_idea');--> statement-breakpoint
CREATE TYPE "public"."verification_method" AS ENUM('gps', 'qr', 'photo', 'narrative');--> statement-breakpoint
CREATE TYPE "public"."verify_outcome" AS ENUM('accepted', 'rejected_distance', 'rejected_accuracy', 'rejected_dwell', 'rejected_code', 'rejected_expired', 'rejected_suspicious', 'pending_review');--> statement-breakpoint
CREATE TABLE "auth"."account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "auth"."user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"is_anonymous" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "auth"."verification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "badges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"scope" "badge_scope" DEFAULT 'individual' NOT NULL,
	"art_key" text DEFAULT 'placeholder' NOT NULL,
	"provenance" "provenance" DEFAULT 'placeholder' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "badges_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "blocks" (
	"blocker_id" uuid NOT NULL,
	"blocked_id" uuid NOT NULL,
	"kind" "block_kind" DEFAULT 'block' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocks_blocker_id_blocked_id_pk" PRIMARY KEY("blocker_id","blocked_id"),
	CONSTRAINT "blocks_not_self" CHECK ("blocks"."blocker_id" <> "blocks"."blocked_id")
);
--> statement-breakpoint
CREATE TABLE "characters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"appearance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"story" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "characters_name_len" CHECK (char_length("characters"."name") between 2 and 32),
	CONSTRAINT "characters_story_len" CHECK (char_length("characters"."story") <= 600)
);
--> statement-breakpoint
CREATE TABLE "moderation_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" "moderation_action_type" NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid,
	"reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mod_target_type" CHECK ("moderation_actions"."target_type" in ('user','report','submission','photo_review','quest','badge','place'))
);
--> statement-breakpoint
CREATE TABLE "parties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"leader_id" uuid NOT NULL,
	"status" "party_status" DEFAULT 'forming' NOT NULL,
	"max_size" smallint DEFAULT 4 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disbanded_at" timestamp with time zone,
	CONSTRAINT "parties_size" CHECK ("parties"."max_size" between 2 and 6)
);
--> statement-breakpoint
CREATE TABLE "party_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"party_id" uuid NOT NULL,
	"inviter_id" uuid NOT NULL,
	"invitee_id" uuid NOT NULL,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() + interval '30 minutes' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "invitations_not_self" CHECK ("party_invitations"."inviter_id" <> "party_invitations"."invitee_id")
);
--> statement-breakpoint
CREATE TABLE "party_members" (
	"party_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "party_role" DEFAULT 'member' NOT NULL,
	"shares_location" boolean DEFAULT false NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	CONSTRAINT "party_members_party_id_user_id_pk" PRIMARY KEY("party_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "photo_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid,
	"owner_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"status" "review_status" DEFAULT 'pending' NOT NULL,
	"reviewer_id" uuid,
	"reviewed_at" timestamp with time zone,
	"reason" text,
	"published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "photo_reviews_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "photo_published_needs_approval" CHECK (not "photo_reviews"."published" or "photo_reviews"."status" = 'approved'),
	CONSTRAINT "photo_review_fields" CHECK ("photo_reviews"."status" = 'pending' or ("photo_reviews"."reviewer_id" is not null and "photo_reviews"."reviewed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"kind" "place_kind" NOT NULL,
	"district" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"geofence_radius_m" smallint DEFAULT 40 NOT NULL,
	"opening_hours" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"accessibility_notes" text DEFAULT '' NOT NULL,
	"safety_notes" text DEFAULT '' NOT NULL,
	"is_public_space" boolean DEFAULT true NOT NULL,
	"is_synthetic" boolean DEFAULT true NOT NULL,
	"provenance" "provenance" DEFAULT 'placeholder' NOT NULL,
	"consent_basis" text DEFAULT 'none' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "places_slug_unique" UNIQUE("slug"),
	CONSTRAINT "places_lat" CHECK ("places"."lat" between -90 and 90),
	CONSTRAINT "places_lng" CHECK ("places"."lng" between -180 and 180),
	CONSTRAINT "places_radius" CHECK ("places"."geofence_radius_m" between 15 and 150),
	CONSTRAINT "places_public_only" CHECK ("places"."is_public_space"),
	CONSTRAINT "places_consent_basis" CHECK ("places"."consent_basis" in ('none','owner_consent','public_landmark'))
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"avatar_key" text DEFAULT 'placeholder-a' NOT NULL,
	"role" "account_role" DEFAULT 'player' NOT NULL,
	"status" "account_status" DEFAULT 'active' NOT NULL,
	"is_guest" boolean DEFAULT true NOT NULL,
	"share_coarse_location" boolean DEFAULT false NOT NULL,
	"terms_version" text,
	"terms_accepted_at" timestamp with time zone,
	"privacy_version" text,
	"privacy_accepted_at" timestamp with time zone,
	"location_consent_at" timestamp with time zone,
	"party_location_consent_at" timestamp with time zone,
	"analytics_consent" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_display_name_len" CHECK (char_length("profiles"."display_name") between 2 and 24)
);
--> statement-breakpoint
CREATE TABLE "quest_completions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"quest_id" uuid NOT NULL,
	"party_id" uuid,
	"content_version" integer DEFAULT 1 NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quest_step_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"quest_id" uuid NOT NULL,
	"step_id" uuid NOT NULL,
	"party_id" uuid,
	"status" "step_status" DEFAULT 'locked' NOT NULL,
	"content_version" integer DEFAULT 1 NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "progress_completed_at" CHECK (("quest_step_progress"."status" = 'completed') = ("quest_step_progress"."completed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "quest_step_secrets" (
	"step_id" uuid PRIMARY KEY NOT NULL,
	"qr_secret_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quest_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quest_id" uuid NOT NULL,
	"ordinal" smallint NOT NULL,
	"place_id" uuid,
	"title" text NOT NULL,
	"clue" text DEFAULT '' NOT NULL,
	"story_unlock" text DEFAULT '' NOT NULL,
	"verification_method" "verification_method" NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quest_steps_ordinal" CHECK ("quest_steps"."ordinal" >= 0),
	CONSTRAINT "quest_steps_place_required" CHECK ("quest_steps"."verification_method" = 'narrative' or "quest_steps"."place_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "quests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"difficulty" "quest_difficulty" DEFAULT 'easy' NOT NULL,
	"estimated_minutes" smallint NOT NULL,
	"reward_xp" integer DEFAULT 0 NOT NULL,
	"reward_badge_id" uuid,
	"min_party_size" smallint DEFAULT 1 NOT NULL,
	"max_party_size" smallint DEFAULT 4 NOT NULL,
	"daylight_only" boolean DEFAULT true NOT NULL,
	"window_start" time,
	"window_end" time,
	"timezone" text DEFAULT 'Asia/Karachi' NOT NULL,
	"provenance" "provenance" DEFAULT 'placeholder' NOT NULL,
	"status" "quest_status" DEFAULT 'draft' NOT NULL,
	"content_version" integer DEFAULT 1 NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quests_slug_unique" UNIQUE("slug"),
	CONSTRAINT "quests_party_bounds" CHECK ("quests"."min_party_size" between 1 and 6 and "quests"."max_party_size" between "quests"."min_party_size" and 6),
	CONSTRAINT "quests_minutes" CHECK ("quests"."estimated_minutes" between 5 and 240),
	CONSTRAINT "quests_xp" CHECK ("quests"."reward_xp" >= 0),
	CONSTRAINT "quests_window_pair" CHECK (("quests"."window_start" is null) = ("quests"."window_end" is null)),
	CONSTRAINT "quests_placeholder_never_published" CHECK ("quests"."provenance" = 'reviewed' or "quests"."status" in ('draft','playtest')),
	CONSTRAINT "quests_published_reviewed" CHECK ("quests"."status" <> 'published' or ("quests"."reviewed_by" is not null and "quests"."reviewed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid NOT NULL,
	"subject_user_id" uuid,
	"subject_party_id" uuid,
	"subject_place_id" uuid,
	"kind" "report_kind" NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reports_detail_len" CHECK (char_length("reports"."detail") <= 500)
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submitter_id" uuid NOT NULL,
	"kind" "submission_kind" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"subject_consent" "subject_consent" DEFAULT 'not_applicable' NOT NULL,
	"contains_private_address" boolean DEFAULT false NOT NULL,
	"status" "review_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submissions_len" CHECK (char_length("submissions"."title") between 3 and 120 and char_length("submissions"."body") between 10 and 2000),
	CONSTRAINT "submissions_person_consent" CHECK ("submissions"."status" <> 'approved' or "submissions"."kind" <> 'person' or "submissions"."subject_consent" = 'obtained'),
	CONSTRAINT "submissions_no_private_address" CHECK ("submissions"."status" <> 'approved' or not "submissions"."contains_private_address"),
	CONSTRAINT "submissions_review_fields" CHECK ("submissions"."status" = 'pending' or ("submissions"."reviewed_by" is not null and "submissions"."reviewed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "user_badges" (
	"user_id" uuid NOT NULL,
	"badge_id" uuid NOT NULL,
	"quest_id" uuid,
	"party_id" uuid,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_badges_user_id_badge_id_pk" PRIMARY KEY("user_id","badge_id")
);
--> statement-breakpoint
CREATE TABLE "verification_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"progress_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"method" "verification_method" NOT NULL,
	"outcome" "verify_outcome" NOT NULL,
	"distance_band" text,
	"accuracy_m" smallint,
	"coarse_district" text,
	"attempt_nonce" uuid NOT NULL,
	"qr_jti" text,
	"reason_flags" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attempts_band" CHECK ("verification_attempts"."distance_band" is null or "verification_attempts"."distance_band" in ('very_close','close','far','unknown'))
);
--> statement-breakpoint
ALTER TABLE "auth"."account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocker_id_user_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocked_id_user_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "auth"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parties" ADD CONSTRAINT "parties_leader_id_user_id_fk" FOREIGN KEY ("leader_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_invitations" ADD CONSTRAINT "party_invitations_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_invitations" ADD CONSTRAINT "party_invitations_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_invitations" ADD CONSTRAINT "party_invitations_invitee_id_user_id_fk" FOREIGN KEY ("invitee_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_members" ADD CONSTRAINT "party_members_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_members" ADD CONSTRAINT "party_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_reviews" ADD CONSTRAINT "photo_reviews_attempt_id_verification_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."verification_attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_reviews" ADD CONSTRAINT "photo_reviews_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_reviews" ADD CONSTRAINT "photo_reviews_reviewer_id_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "auth"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_completions" ADD CONSTRAINT "quest_completions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_completions" ADD CONSTRAINT "quest_completions_quest_id_quests_id_fk" FOREIGN KEY ("quest_id") REFERENCES "public"."quests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_completions" ADD CONSTRAINT "quest_completions_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_step_progress" ADD CONSTRAINT "quest_step_progress_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_step_progress" ADD CONSTRAINT "quest_step_progress_quest_id_quests_id_fk" FOREIGN KEY ("quest_id") REFERENCES "public"."quests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_step_progress" ADD CONSTRAINT "quest_step_progress_step_id_quest_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."quest_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_step_progress" ADD CONSTRAINT "quest_step_progress_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_step_secrets" ADD CONSTRAINT "quest_step_secrets_step_id_quest_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."quest_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_steps" ADD CONSTRAINT "quest_steps_quest_id_quests_id_fk" FOREIGN KEY ("quest_id") REFERENCES "public"."quests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_steps" ADD CONSTRAINT "quest_steps_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quests" ADD CONSTRAINT "quests_reward_badge_id_badges_id_fk" FOREIGN KEY ("reward_badge_id") REFERENCES "public"."badges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quests" ADD CONSTRAINT "quests_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_subject_user_id_user_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "auth"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_subject_party_id_parties_id_fk" FOREIGN KEY ("subject_party_id") REFERENCES "public"."parties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_subject_place_id_places_id_fk" FOREIGN KEY ("subject_place_id") REFERENCES "public"."places"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_submitter_id_user_id_fk" FOREIGN KEY ("submitter_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_badge_id_badges_id_fk" FOREIGN KEY ("badge_id") REFERENCES "public"."badges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_quest_id_quests_id_fk" FOREIGN KEY ("quest_id") REFERENCES "public"."quests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_attempts" ADD CONSTRAINT "verification_attempts_progress_id_quest_step_progress_id_fk" FOREIGN KEY ("progress_id") REFERENCES "public"."quest_step_progress"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_attempts" ADD CONSTRAINT "verification_attempts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "auth"."account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "auth"."session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "blocks_blocked_idx" ON "blocks" USING btree ("blocked_id");--> statement-breakpoint
CREATE UNIQUE INDEX "characters_one_per_user" ON "characters" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mod_actions_target_idx" ON "moderation_actions" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_one_pending" ON "party_invitations" USING btree ("party_id","invitee_id") WHERE "party_invitations"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "invitations_invitee_idx" ON "party_invitations" USING btree ("invitee_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "party_members_one_live" ON "party_members" USING btree ("user_id") WHERE "party_members"."left_at" is null;--> statement-breakpoint
CREATE INDEX "photo_reviews_status_idx" ON "photo_reviews" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "places_district_idx" ON "places" USING btree ("district");--> statement-breakpoint
CREATE INDEX "profiles_role_idx" ON "profiles" USING btree ("role");--> statement-breakpoint
CREATE UNIQUE INDEX "completions_user_quest" ON "quest_completions" USING btree ("user_id","quest_id");--> statement-breakpoint
CREATE UNIQUE INDEX "progress_user_step" ON "quest_step_progress" USING btree ("user_id","step_id");--> statement-breakpoint
CREATE INDEX "progress_user_quest_idx" ON "quest_step_progress" USING btree ("user_id","quest_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quest_steps_order" ON "quest_steps" USING btree ("quest_id","ordinal");--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "submissions_status_idx" ON "submissions" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "attempts_nonce" ON "verification_attempts" USING btree ("progress_id","attempt_nonce");--> statement-breakpoint
CREATE UNIQUE INDEX "attempts_qr_jti" ON "verification_attempts" USING btree ("qr_jti") WHERE "verification_attempts"."qr_jti" is not null;--> statement-breakpoint
CREATE INDEX "attempts_created_idx" ON "verification_attempts" USING btree ("created_at");