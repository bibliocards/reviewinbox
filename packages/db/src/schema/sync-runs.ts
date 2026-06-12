import type { InferInsertModel, InferSelectModel } from "drizzle-orm"
import { foreignKey, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

import { syncRunStatus } from "./enums.js"
import { storeConnection } from "./store-connections.js"

export const syncRun = pgTable(
  "sync_run",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id").notNull(),
    appId: uuid("app_id").notNull(),
    storeConnectionId: uuid("store_connection_id").notNull(),
    status: syncRunStatus("status").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    reviewsFetched: integer("reviews_fetched").notNull().default(0),
    reviewsCreated: integer("reviews_created").notNull().default(0),
    errorMessage: text("error_message"),
  },
  (table) => [
    foreignKey({
      columns: [table.storeConnectionId, table.appId, table.organizationId],
      foreignColumns: [storeConnection.id, storeConnection.appId, storeConnection.organizationId],
      name: "sync_run_store_connection_ownership_fk",
    }).onDelete("cascade"),
    index("sync_run_organization_id_started_at_idx").on(table.organizationId, table.startedAt),
    index("sync_run_app_id_started_at_idx").on(table.appId, table.startedAt),
    index("sync_run_store_connection_id_started_at_idx").on(
      table.storeConnectionId,
      table.startedAt,
    ),
  ],
)

export type SyncRun = InferSelectModel<typeof syncRun>
export type NewSyncRun = InferInsertModel<typeof syncRun>
