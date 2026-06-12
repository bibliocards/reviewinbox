import type { InferInsertModel, InferSelectModel } from "drizzle-orm"
import {
  boolean,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { app } from "./apps.js"
import { storeKind } from "./enums.js"

export const storeConnection = pgTable(
  "store_connection",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id").notNull(),
    appId: uuid("app_id").notNull(),
    store: storeKind("store").notNull(),
    externalAppId: text("external_app_id").notNull(),
    displayName: text("display_name"),
    syncEnabled: boolean("sync_enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.appId, table.organizationId],
      foreignColumns: [app.id, app.organizationId],
      name: "store_connection_app_organization_fk",
    }).onDelete("cascade"),
    uniqueIndex("store_connection_id_app_id_organization_id_unique").on(
      table.id,
      table.appId,
      table.organizationId,
    ),
    uniqueIndex("store_connection_app_id_store_unique").on(table.appId, table.store),
    index("store_connection_organization_id_idx").on(table.organizationId),
    index("store_connection_app_id_idx").on(table.appId),
  ],
)

export type StoreConnection = InferSelectModel<typeof storeConnection>
export type NewStoreConnection = InferInsertModel<typeof storeConnection>
