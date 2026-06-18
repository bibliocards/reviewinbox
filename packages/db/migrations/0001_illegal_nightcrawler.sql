CREATE TYPE "public"."reply_status" AS ENUM('pending', 'drafted', 'published', 'ignored', 'failed');--> statement-breakpoint
CREATE TYPE "public"."store_connection_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."store_provider" AS ENUM('apple_app_store', 'google_play');--> statement-breakpoint
CREATE TYPE "public"."sync_run_status" AS ENUM('pending', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TABLE "apps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"app_id" uuid NOT NULL,
	"store_connection_id" uuid NOT NULL,
	"external_review_id" text NOT NULL,
	"author_display_name" text,
	"rating" integer NOT NULL,
	"title" text,
	"body" text NOT NULL,
	"language" text,
	"version" text,
	"country" text,
	"locale" text,
	"reviewed_at" timestamp NOT NULL,
	"reply_status" "reply_status" DEFAULT 'pending' NOT NULL,
	"raw_payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"app_id" uuid NOT NULL,
	"provider" "store_provider" NOT NULL,
	"status" "store_connection_status" DEFAULT 'active' NOT NULL,
	"external_app_id" text,
	"external_store_id" text,
	"display_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_connection_id" uuid NOT NULL,
	"ciphertext" text NOT NULL,
	"nonce" text NOT NULL,
	"auth_tag" text NOT NULL,
	"algorithm" text NOT NULL,
	"version" integer NOT NULL,
	"key_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"app_id" uuid NOT NULL,
	"store_connection_id" uuid NOT NULL,
	"status" "sync_run_status" DEFAULT 'pending' NOT NULL,
	"started_at" timestamp,
	"finished_at" timestamp,
	"fetched_count" integer DEFAULT 0 NOT NULL,
	"stored_count" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"error_message" text,
	"checkpoint" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "apps" ADD CONSTRAINT "apps_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_store_connection_id_store_connections_id_fk" FOREIGN KEY ("store_connection_id") REFERENCES "public"."store_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_connections" ADD CONSTRAINT "store_connections_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_connections" ADD CONSTRAINT "store_connections_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_credentials" ADD CONSTRAINT "store_credentials_store_connection_id_store_connections_id_fk" FOREIGN KEY ("store_connection_id") REFERENCES "public"."store_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_store_connection_id_store_connections_id_fk" FOREIGN KEY ("store_connection_id") REFERENCES "public"."store_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "apps_organization_id_idx" ON "apps" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_store_connection_external_review_uidx" ON "reviews" USING btree ("store_connection_id","external_review_id");--> statement-breakpoint
CREATE INDEX "reviews_organization_id_idx" ON "reviews" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "reviews_app_id_idx" ON "reviews" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "reviews_store_connection_id_idx" ON "reviews" USING btree ("store_connection_id");--> statement-breakpoint
CREATE INDEX "reviews_reviewed_at_idx" ON "reviews" USING btree ("reviewed_at");--> statement-breakpoint
CREATE INDEX "reviews_reply_status_idx" ON "reviews" USING btree ("reply_status");--> statement-breakpoint
CREATE INDEX "store_connections_organization_id_idx" ON "store_connections" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "store_connections_app_id_idx" ON "store_connections" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "store_connections_provider_idx" ON "store_connections" USING btree ("provider");--> statement-breakpoint
CREATE UNIQUE INDEX "store_connections_app_provider_uidx" ON "store_connections" USING btree ("app_id","provider");--> statement-breakpoint
CREATE INDEX "store_credentials_store_connection_id_idx" ON "store_credentials" USING btree ("store_connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "store_credentials_store_connection_id_uidx" ON "store_credentials" USING btree ("store_connection_id");--> statement-breakpoint
CREATE INDEX "sync_runs_organization_id_idx" ON "sync_runs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "sync_runs_app_id_idx" ON "sync_runs" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "sync_runs_store_connection_id_idx" ON "sync_runs" USING btree ("store_connection_id");--> statement-breakpoint
CREATE INDEX "sync_runs_status_idx" ON "sync_runs" USING btree ("status");