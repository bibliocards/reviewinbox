CREATE TYPE "public"."reply_workflow_status" AS ENUM('pending', 'drafted', 'published', 'ignored', 'failed');--> statement-breakpoint
CREATE TYPE "public"."store_kind" AS ENUM('apple_app_store', 'google_play');--> statement-breakpoint
CREATE TYPE "public"."sync_run_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"auto_draft_replies" boolean DEFAULT true NOT NULL,
	"reply_context_markdown" text DEFAULT '' NOT NULL,
	"default_reply_language" text DEFAULT 'en' NOT NULL,
	"mapped_reply_languages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"app_id" uuid NOT NULL,
	"store_connection_id" uuid NOT NULL,
	"external_review_id" text NOT NULL,
	"rating" integer NOT NULL,
	"title" text,
	"body" text NOT NULL,
	"author_name" text,
	"store_locale" text,
	"detected_language" text,
	"reply_status" "reply_workflow_status" DEFAULT 'pending' NOT NULL,
	"external_created_at" timestamp with time zone,
	"external_updated_at" timestamp with time zone,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_connection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"app_id" uuid NOT NULL,
	"store" "store_kind" NOT NULL,
	"external_app_id" text NOT NULL,
	"display_name" text,
	"sync_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_credential" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"app_id" uuid NOT NULL,
	"store_connection_id" uuid NOT NULL,
	"ciphertext" text NOT NULL,
	"encryption_algorithm" text NOT NULL,
	"nonce" text NOT NULL,
	"key_id" text,
	"key_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"app_id" uuid NOT NULL,
	"store_connection_id" uuid NOT NULL,
	"status" "sync_run_status" NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"reviews_fetched" integer DEFAULT 0 NOT NULL,
	"reviews_created" integer DEFAULT 0 NOT NULL,
	"error_message" text
);
--> statement-breakpoint
ALTER TABLE "app" ADD CONSTRAINT "app_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_store_connection_ownership_fk" FOREIGN KEY ("store_connection_id","app_id","organization_id") REFERENCES "public"."store_connection"("id","app_id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_connection" ADD CONSTRAINT "store_connection_app_organization_fk" FOREIGN KEY ("app_id","organization_id") REFERENCES "public"."app"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_credential" ADD CONSTRAINT "store_credential_store_connection_ownership_fk" FOREIGN KEY ("store_connection_id","app_id","organization_id") REFERENCES "public"."store_connection"("id","app_id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_run" ADD CONSTRAINT "sync_run_store_connection_ownership_fk" FOREIGN KEY ("store_connection_id","app_id","organization_id") REFERENCES "public"."store_connection"("id","app_id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_slug_unique" ON "organization" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "app_id_organization_id_unique" ON "app" USING btree ("id","organization_id");--> statement-breakpoint
CREATE INDEX "app_organization_id_idx" ON "app" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "review_store_connection_id_external_review_id_unique" ON "review" USING btree ("store_connection_id","external_review_id");--> statement-breakpoint
CREATE INDEX "review_organization_id_reply_status_imported_at_idx" ON "review" USING btree ("organization_id","reply_status","imported_at");--> statement-breakpoint
CREATE INDEX "review_app_id_reply_status_imported_at_idx" ON "review" USING btree ("app_id","reply_status","imported_at");--> statement-breakpoint
CREATE INDEX "review_store_connection_id_imported_at_idx" ON "review" USING btree ("store_connection_id","imported_at");--> statement-breakpoint
CREATE UNIQUE INDEX "store_connection_id_app_id_organization_id_unique" ON "store_connection" USING btree ("id","app_id","organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "store_connection_app_id_store_unique" ON "store_connection" USING btree ("app_id","store");--> statement-breakpoint
CREATE INDEX "store_connection_organization_id_idx" ON "store_connection" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "store_connection_app_id_idx" ON "store_connection" USING btree ("app_id");--> statement-breakpoint
CREATE UNIQUE INDEX "store_credential_store_connection_id_unique" ON "store_credential" USING btree ("store_connection_id");--> statement-breakpoint
CREATE INDEX "store_credential_organization_id_idx" ON "store_credential" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "sync_run_organization_id_started_at_idx" ON "sync_run" USING btree ("organization_id","started_at");--> statement-breakpoint
CREATE INDEX "sync_run_app_id_started_at_idx" ON "sync_run" USING btree ("app_id","started_at");--> statement-breakpoint
CREATE INDEX "sync_run_store_connection_id_started_at_idx" ON "sync_run" USING btree ("store_connection_id","started_at");