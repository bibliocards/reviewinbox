import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { organization } from './auth-schema'

export const apps = pgTable(
  'apps',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    autoDraftEnabled: boolean('auto_draft_enabled').default(true).notNull(),
    replyContext: text('reply_context').default('').notNull(),
    defaultLanguage: text('default_language').default('en').notNull(),
    mappedLanguages: jsonb('mapped_languages').$type<string[]>().default([]).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index('apps_organization_id_idx').on(table.organizationId)],
)
