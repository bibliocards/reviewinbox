CREATE TABLE "store_sync_health" (
	"store_connection_id" uuid PRIMARY KEY NOT NULL,
	"last_run_started_at" timestamp NOT NULL,
	"consecutive_automatic_failures" integer DEFAULT 0 NOT NULL,
	"incident_id" uuid,
	"opened_at" timestamp,
	"error_code" text
);
--> statement-breakpoint
CREATE TABLE "sync_webhook_deliveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"destination_revision" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"next_attempt_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_webhook_destinations" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"revision" uuid DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"app_origin" text NOT NULL,
	"encrypted" jsonb NOT NULL,
	"last_delivery_at" timestamp,
	"last_delivery_status" text
);
--> statement-breakpoint
ALTER TABLE "store_sync_health" ADD CONSTRAINT "store_sync_health_store_connection_id_store_connections_id_fk" FOREIGN KEY ("store_connection_id") REFERENCES "public"."store_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_webhook_deliveries" ADD CONSTRAINT "sync_webhook_deliveries_organization_id_sync_webhook_destinations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."sync_webhook_destinations"("organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_webhook_destinations" ADD CONSTRAINT "sync_webhook_destinations_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sync_webhook_deliveries_due_idx" ON "sync_webhook_deliveries" USING btree ("next_attempt_at");