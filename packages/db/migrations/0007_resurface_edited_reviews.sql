ALTER TABLE "reviews" ADD COLUMN "changed_after_reply" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "reply_baseline" jsonb;