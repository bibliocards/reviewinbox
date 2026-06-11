import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import {
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { replyWorkflowStatus } from "./enums.js";
import { storeConnection } from "./store-connections.js";

export const review = pgTable(
  "review",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id").notNull(),
    appId: uuid("app_id").notNull(),
    storeConnectionId: uuid("store_connection_id").notNull(),
    externalReviewId: text("external_review_id").notNull(),
    rating: integer("rating").notNull(),
    title: text("title"),
    body: text("body").notNull(),
    authorName: text("author_name"),
    storeLocale: text("store_locale"),
    detectedLanguage: text("detected_language"),
    replyStatus: replyWorkflowStatus("reply_status").notNull().default("pending"),
    externalCreatedAt: timestamp("external_created_at", { withTimezone: true }),
    externalUpdatedAt: timestamp("external_updated_at", { withTimezone: true }),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.storeConnectionId, table.appId, table.organizationId],
      foreignColumns: [storeConnection.id, storeConnection.appId, storeConnection.organizationId],
      name: "review_store_connection_ownership_fk",
    }).onDelete("cascade"),
    uniqueIndex("review_store_connection_id_external_review_id_unique").on(
      table.storeConnectionId,
      table.externalReviewId,
    ),
    index("review_organization_id_reply_status_imported_at_idx").on(
      table.organizationId,
      table.replyStatus,
      table.importedAt,
    ),
    index("review_app_id_reply_status_imported_at_idx").on(
      table.appId,
      table.replyStatus,
      table.importedAt,
    ),
    index("review_store_connection_id_imported_at_idx").on(
      table.storeConnectionId,
      table.importedAt,
    ),
  ],
);

export type Review = InferSelectModel<typeof review>;
export type NewReview = InferInsertModel<typeof review>;
