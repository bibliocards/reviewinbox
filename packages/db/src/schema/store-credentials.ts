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

import { storeConnection } from "./store-connections.js";

export const storeCredential = pgTable(
  "store_credential",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id").notNull(),
    appId: uuid("app_id").notNull(),
    storeConnectionId: uuid("store_connection_id").notNull(),
    ciphertext: text("ciphertext").notNull(),
    encryptionAlgorithm: text("encryption_algorithm").notNull(),
    nonce: text("nonce").notNull(),
    keyId: text("key_id"),
    keyVersion: integer("key_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.storeConnectionId, table.appId, table.organizationId],
      foreignColumns: [storeConnection.id, storeConnection.appId, storeConnection.organizationId],
      name: "store_credential_store_connection_ownership_fk",
    }).onDelete("cascade"),
    uniqueIndex("store_credential_store_connection_id_unique").on(table.storeConnectionId),
    index("store_credential_organization_id_idx").on(table.organizationId),
  ],
);

export type StoreCredential = InferSelectModel<typeof storeCredential>;
export type NewStoreCredential = InferInsertModel<typeof storeCredential>;
