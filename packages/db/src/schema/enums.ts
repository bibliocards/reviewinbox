import { pgEnum } from "drizzle-orm/pg-core";

export const storeKind = pgEnum("store_kind", ["apple_app_store", "google_play"]);

export const replyWorkflowStatus = pgEnum("reply_workflow_status", [
  "pending",
  "drafted",
  "published",
  "ignored",
  "failed",
]);

export const syncRunStatus = pgEnum("sync_run_status", ["running", "succeeded", "failed"]);
