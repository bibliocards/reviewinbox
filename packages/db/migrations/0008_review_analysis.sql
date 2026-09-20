CREATE TABLE "review_analyses" (
	"review_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"app_id" uuid NOT NULL,
	"input_hash" text NOT NULL,
	"criteria_version" text NOT NULL,
	"catalog_version" integer NOT NULL,
	"model" text NOT NULL,
	"severity" text,
	"intents" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"uncovered" boolean DEFAULT false NOT NULL,
	"probabilities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"manual_override" jsonb,
	"override_input_hash" text,
	"needs_recheck" boolean DEFAULT false NOT NULL,
	"discovered_at" timestamp,
	"analyzed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_analysis_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"app_id" uuid NOT NULL,
	"review_id" uuid,
	"topic_id" uuid,
	"actor_user_id" text,
	"action" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_topic_assignments" (
	"review_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"probability" double precision NOT NULL,
	CONSTRAINT "review_topic_assignments_review_id_topic_id_pk" PRIMARY KEY("review_id","topic_id")
);
--> statement-breakpoint
CREATE TABLE "review_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"app_id" uuid NOT NULL,
	"label" text NOT NULL,
	"normalized_label" text NOT NULL,
	"description" text NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"origin" text NOT NULL,
	"merged_into_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "analysis_catalog_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "topic_discovery_requested_at" timestamp;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "last_topic_discovery_at" timestamp;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "analysis_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "analysis_started_at" timestamp;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "analysis_failure_code" text;--> statement-breakpoint
ALTER TABLE "review_analyses" ADD CONSTRAINT "review_analyses_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_analyses" ADD CONSTRAINT "review_analyses_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_analyses" ADD CONSTRAINT "review_analyses_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_analysis_events" ADD CONSTRAINT "review_analysis_events_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_analysis_events" ADD CONSTRAINT "review_analysis_events_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_analysis_events" ADD CONSTRAINT "review_analysis_events_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_analysis_events" ADD CONSTRAINT "review_analysis_events_topic_id_review_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."review_topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_topic_assignments" ADD CONSTRAINT "review_topic_assignments_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_topic_assignments" ADD CONSTRAINT "review_topic_assignments_topic_id_review_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."review_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_topics" ADD CONSTRAINT "review_topics_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_topics" ADD CONSTRAINT "review_topics_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "review_analyses_org_app_idx" ON "review_analyses" USING btree ("organization_id","app_id");--> statement-breakpoint
CREATE INDEX "review_analysis_events_org_app_idx" ON "review_analysis_events" USING btree ("organization_id","app_id");--> statement-breakpoint
CREATE INDEX "review_topic_assignments_topic_idx" ON "review_topic_assignments" USING btree ("topic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "review_topics_app_label_uidx" ON "review_topics" USING btree ("app_id","normalized_label");--> statement-breakpoint
CREATE INDEX "review_topics_organization_app_idx" ON "review_topics" USING btree ("organization_id","app_id");--> statement-breakpoint
CREATE INDEX "reviews_analysis_status_idx" ON "reviews" USING btree ("analysis_status");