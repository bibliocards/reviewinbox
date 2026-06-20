CREATE TYPE "public"."draft_failure_code" AS ENUM('provider_unavailable', 'provider_rate_limited', 'invalid_provider_config', 'safety_rejected', 'context_too_large', 'invalid_model_output', 'unknown');--> statement-breakpoint
CREATE TABLE "reply_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"app_id" uuid NOT NULL,
	"review_id" uuid NOT NULL,
	"draft_text" text NOT NULL,
	"detected_review_language" text,
	"chosen_reply_language" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "auto_draft_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "reply_context" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "default_language" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "mapped_languages" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "detected_review_language" text;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "chosen_reply_language" text;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "draft_failure_code" "draft_failure_code";--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "draft_failure_at" timestamp;--> statement-breakpoint
ALTER TABLE "reply_drafts" ADD CONSTRAINT "reply_drafts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply_drafts" ADD CONSTRAINT "reply_drafts_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply_drafts" ADD CONSTRAINT "reply_drafts_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reply_drafts_review_id_uidx" ON "reply_drafts" USING btree ("review_id");--> statement-breakpoint
CREATE INDEX "reply_drafts_organization_id_idx" ON "reply_drafts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "reply_drafts_app_id_idx" ON "reply_drafts" USING btree ("app_id");