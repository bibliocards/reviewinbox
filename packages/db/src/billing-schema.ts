import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { organization } from './auth-schema'

type StoredUsageEventType = 'review_imported' | 'managed_ai_reply_draft_generated' | 'published_reply_created' | 'weekly_digest_generated'

export const usageEvents = pgTable(
  'usage_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    type: text('type').$type<StoredUsageEventType>().notNull(),
    quantity: integer('quantity').notNull(),
    occurredAt: timestamp('occurred_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('usage_events_organization_id_idx').on(table.organizationId),
    index('usage_events_type_idx').on(table.type),
    index('usage_events_occurred_at_idx').on(table.occurredAt),
  ],
)
