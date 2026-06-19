import { index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

import { apps } from './app-schema'
import { organization } from './auth-schema'

export const storeProviderEnum = pgEnum('store_provider', ['apple_app_store', 'google_play'])
export const storeConnectionStatusEnum = pgEnum('store_connection_status', ['active', 'disabled'])

export const storeConnections = pgTable(
  'store_connections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    provider: storeProviderEnum('provider').notNull(),
    status: storeConnectionStatusEnum('status').default('active').notNull(),
    externalAppId: text('external_app_id'),
    externalStoreId: text('external_store_id'),
    displayName: text('display_name'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index('store_connections_organization_id_idx').on(table.organizationId),
    index('store_connections_app_id_idx').on(table.appId),
    index('store_connections_provider_idx').on(table.provider),
    uniqueIndex('store_connections_app_provider_uidx').on(table.appId, table.provider),
  ],
)

export const storeCredentials = pgTable(
  'store_credentials',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    storeConnectionId: uuid('store_connection_id')
      .notNull()
      .references(() => storeConnections.id, { onDelete: 'cascade' }),
    ciphertext: text('ciphertext').notNull(),
    nonce: text('nonce').notNull(),
    authTag: text('auth_tag').notNull(),
    algorithm: text('algorithm').notNull(),
    version: integer('version').notNull(),
    keyId: text('key_id').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index('store_credentials_store_connection_id_idx').on(table.storeConnectionId),
    uniqueIndex('store_credentials_store_connection_id_uidx').on(table.storeConnectionId),
  ],
)
