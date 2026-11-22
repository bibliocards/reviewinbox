import type { EncryptedStoreCredential } from '@reviewinbox/core'
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { organization } from './auth-schema'
import { storeConnections } from './store-schema'

export const syncWebhookDestinations = pgTable('sync_webhook_destinations', {
  organizationId: text('organization_id')
    .primaryKey()
    .references(() => organization.id, { onDelete: 'cascade' }),
  revision: uuid('revision').defaultRandom().notNull(),
  kind: text('kind', { enum: ['slack', 'discord', 'json'] }).notNull(),
  appOrigin: text('app_origin').notNull(),
  encrypted: jsonb('encrypted').$type<EncryptedStoreCredential>().notNull(),
  lastDeliveryAt: timestamp('last_delivery_at'),
  lastDeliveryStatus: text('last_delivery_status', { enum: ['delivered', 'retrying', 'failed'] }),
})

export const storeSyncHealth = pgTable('store_sync_health', {
  storeConnectionId: uuid('store_connection_id')
    .primaryKey()
    .references(() => storeConnections.id, { onDelete: 'cascade' }),
  lastRunStartedAt: timestamp('last_run_started_at').notNull(),
  consecutiveAutomaticFailures: integer('consecutive_automatic_failures').default(0).notNull(),
  incidentId: uuid('incident_id'),
  openedAt: timestamp('opened_at'),
  errorCode: text('error_code'),
})

export type SyncWebhookEvent = {
  eventId: string
  type: 'sync.incident.opened' | 'sync.incident.resolved'
  occurredAt: string
  incidentId: string
  appId: string
  appName: string
  store: 'apple_app_store' | 'google_play'
  storeConnectionId: string
  errorCode: string
  message: string
  lastSuccessfulSyncAt: string | null
  appPath: string
}

export const syncWebhookDeliveries = pgTable(
  'sync_webhook_deliveries',
  {
    id: uuid('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => syncWebhookDestinations.organizationId, { onDelete: 'cascade' }),
    destinationRevision: uuid('destination_revision').notNull(),
    payload: jsonb('payload').$type<SyncWebhookEvent>().notNull(),
    attempts: integer('attempts').default(0).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    nextAttemptAt: timestamp('next_attempt_at').defaultNow().notNull(),
  },
  (table) => [index('sync_webhook_deliveries_due_idx').on(table.nextAttemptAt)],
)
