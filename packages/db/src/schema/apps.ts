import type { InferInsertModel, InferSelectModel } from "drizzle-orm"
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { organization } from "./auth.js"

export const app = pgTable(
  "app",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    autoDraftReplies: boolean("auto_draft_replies").notNull().default(true),
    replyContextMarkdown: text("reply_context_markdown").notNull().default(""),
    defaultReplyLanguage: text("default_reply_language").notNull().default("en"),
    mappedReplyLanguages: jsonb("mapped_reply_languages").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("app_id_organization_id_unique").on(table.id, table.organizationId),
    index("app_organization_id_idx").on(table.organizationId),
  ],
)

export type App = InferSelectModel<typeof app>
export type NewApp = InferInsertModel<typeof app>
