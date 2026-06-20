import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

import { apps } from './app-schema'
import { organization } from './auth-schema'
import { storeConnections } from './store-schema'

export const replyStatusEnum = pgEnum('reply_status', ['pending', 'drafted', 'published', 'ignored', 'failed'])
export const draftFailureCodeEnum = pgEnum('draft_failure_code', [
  'provider_unavailable',
  'provider_rate_limited',
  'invalid_provider_config',
  'safety_rejected',
  'context_too_large',
  'invalid_model_output',
  'unknown',
])

export const reviews = pgTable(
  'reviews',
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
    externalReviewId: text('external_review_id').notNull(),
    authorDisplayName: text('author_display_name'),
    rating: integer('rating').notNull(),
    title: text('title'),
    body: text('body').notNull(),
    language: text('language'),
    version: text('version'),
    country: text('country'),
    locale: text('locale'),
    reviewedAt: timestamp('reviewed_at').notNull(),
    replyStatus: replyStatusEnum('reply_status').default('pending').notNull(),
    detectedReviewLanguage: text('detected_review_language'),
    chosenReplyLanguage: text('chosen_reply_language'),
    draftFailureCode: draftFailureCodeEnum('draft_failure_code'),
    draftFailureAt: timestamp('draft_failure_at'),
    rawPayload: jsonb('raw_payload'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex('reviews_store_connection_external_review_uidx').on(table.storeConnectionId, table.externalReviewId),
    index('reviews_organization_id_idx').on(table.organizationId),
    index('reviews_app_id_idx').on(table.appId),
    index('reviews_store_connection_id_idx').on(table.storeConnectionId),
    index('reviews_reviewed_at_idx').on(table.reviewedAt),
    index('reviews_reply_status_idx').on(table.replyStatus),
  ],
)
