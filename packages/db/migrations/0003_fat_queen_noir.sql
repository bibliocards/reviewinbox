CREATE TYPE "public"."reply_audit_action" AS ENUM('draft_created', 'draft_edited', 'ignored', 'unignored', 'publish_failed', 'published');--> statement-breakpoint
CREATE TABLE "published_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"app_id" uuid NOT NULL,
	"store_connection_id" uuid NOT NULL,
	"review_id" uuid NOT NULL,
	"reply_draft_id" uuid NOT NULL,
	"actor_user_id" text NOT NULL,
	"provider" text NOT NULL,
	"external_reply_id" text,
	"reply_text" text NOT NULL,
	"published_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reply_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"app_id" uuid NOT NULL,
	"review_id" uuid NOT NULL,
	"actor_user_id" text NOT NULL,
	"action" "reply_audit_action" NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "published_replies" ADD CONSTRAINT "published_replies_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "published_replies" ADD CONSTRAINT "published_replies_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "published_replies" ADD CONSTRAINT "published_replies_store_connection_id_store_connections_id_fk" FOREIGN KEY ("store_connection_id") REFERENCES "public"."store_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "published_replies" ADD CONSTRAINT "published_replies_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "published_replies" ADD CONSTRAINT "published_replies_reply_draft_id_reply_drafts_id_fk" FOREIGN KEY ("reply_draft_id") REFERENCES "public"."reply_drafts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "published_replies" ADD CONSTRAINT "published_replies_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply_audit_events" ADD CONSTRAINT "reply_audit_events_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply_audit_events" ADD CONSTRAINT "reply_audit_events_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply_audit_events" ADD CONSTRAINT "reply_audit_events_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply_audit_events" ADD CONSTRAINT "reply_audit_events_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "published_replies_review_id_uidx" ON "published_replies" USING btree ("review_id");--> statement-breakpoint
CREATE INDEX "published_replies_organization_id_idx" ON "published_replies" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "published_replies_app_id_idx" ON "published_replies" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "published_replies_store_connection_id_idx" ON "published_replies" USING btree ("store_connection_id");--> statement-breakpoint
CREATE INDEX "reply_audit_events_organization_id_idx" ON "reply_audit_events" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "reply_audit_events_app_id_idx" ON "reply_audit_events" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "reply_audit_events_review_id_idx" ON "reply_audit_events" USING btree ("review_id");--> statement-breakpoint
CREATE INDEX "reply_audit_events_created_at_idx" ON "reply_audit_events" USING btree ("created_at");