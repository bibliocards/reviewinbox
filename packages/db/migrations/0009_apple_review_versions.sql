ALTER TABLE "reviews" ADD COLUMN "version_lookup_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "version_lookup_scan_id" uuid;--> statement-breakpoint
ALTER TABLE "store_connections" ADD COLUMN "apple_version_lookup" jsonb;--> statement-breakpoint
UPDATE "reviews" SET "version_lookup_status" = 'resolved' WHERE "version" IS NOT NULL;
