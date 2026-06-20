import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

import { apps } from './app-schema'
import { organization } from './auth-schema'
import { reviews } from './review-schema'

export const replyDrafts = pgTable(
  'reply_drafts',
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
    draftText: text('draft_text').notNull(),
    detectedReviewLanguage: text('detected_review_language'),
    chosenReplyLanguage: text('chosen_reply_language').notNull(),
    model: text('model').notNull(),
    promptVersion: text('prompt_version').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex('reply_drafts_review_id_uidx').on(table.reviewId),
    index('reply_drafts_organization_id_idx').on(table.organizationId),
    index('reply_drafts_app_id_idx').on(table.appId),
  ],
)
