import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { apps } from './app-schema'
import { organization } from './auth-schema'
import { storeConnections } from './store-schema'

export const syncRunStatusEnum = pgEnum('sync_run_status', ['pending', 'running', 'succeeded', 'failed'])

export const syncRuns = pgTable(
  'sync_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    storeConnectionId: uuid('store_connection_id')
      .notNull()
      .references(() => storeConnections.id, { onDelete: 'cascade' }),
    status: syncRunStatusEnum('status').default('pending').notNull(),
    startedAt: timestamp('started_at'),
    finishedAt: timestamp('finished_at'),
    fetchedCount: integer('fetched_count').default(0).notNull(),
    storedCount: integer('stored_count').default(0).notNull(),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    checkpoint: jsonb('checkpoint'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index('sync_runs_organization_id_idx').on(table.organizationId),
    index('sync_runs_app_id_idx').on(table.appId),
    index('sync_runs_store_connection_id_idx').on(table.storeConnectionId),
    index('sync_runs_status_idx').on(table.status),
  ],
)
