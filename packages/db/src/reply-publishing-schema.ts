import { index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

import { apps } from './app-schema'
import { organization, user } from './auth-schema'
import { replyDrafts } from './reply-draft-schema'
import { reviews } from './review-schema'
import { storeConnections } from './store-schema'

export const replyAuditActionEnum = pgEnum('reply_audit_action', [
  'draft_created',
  'draft_edited',
  'ignored',
  'unignored',
  'publish_failed',
  'published',
])

export const publishedReplies = pgTable(
  'published_replies',
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
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    replyDraftId: uuid('reply_draft_id')
      .notNull()
      .references(() => replyDrafts.id, { onDelete: 'restrict' }),
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    provider: text('provider').notNull(),
    externalReplyId: text('external_reply_id'),
    replyText: text('reply_text').notNull(),
    publishedAt: timestamp('published_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex('published_replies_review_id_uidx').on(table.reviewId),
    index('published_replies_organization_id_idx').on(table.organizationId),
    index('published_replies_app_id_idx').on(table.appId),
    index('published_replies_store_connection_id_idx').on(table.storeConnectionId),
  ],
)

export const replyAuditEvents = pgTable(
  'reply_audit_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    action: replyAuditActionEnum('action').notNull(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('reply_audit_events_organization_id_idx').on(table.organizationId),
    index('reply_audit_events_app_id_idx').on(table.appId),
    index('reply_audit_events_review_id_idx').on(table.reviewId),
    index('reply_audit_events_created_at_idx').on(table.createdAt),
  ],
)
