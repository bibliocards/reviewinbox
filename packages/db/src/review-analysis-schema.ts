import type { ClassificationOverride, ReportedSeverity, ReviewIntent } from '@reviewinbox/contracts'
import {
  boolean,
  doublePrecision,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { apps } from './app-schema'
import { organization } from './auth-schema'
import { reviews } from './review-schema'

export const reviewTopics = pgTable(
  'review_topics',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    normalizedLabel: text('normalized_label').notNull(),
    description: text('description').notNull(),
    aliases: jsonb('aliases').$type<string[]>().default([]).notNull(),
    status: text('status')
      .$type<'pending' | 'approved' | 'rejected'>()
      .default('pending')
      .notNull(),
    origin: text('origin').$type<'human' | 'ai'>().notNull(),
    mergedIntoId: uuid('merged_into_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('review_topics_app_label_uidx').on(table.appId, table.normalizedLabel),
    index('review_topics_organization_app_idx').on(table.organizationId, table.appId),
  ],
)

export const reviewAnalyses = pgTable(
  'review_analyses',
  {
    reviewId: uuid('review_id')
      .primaryKey()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    inputHash: text('input_hash').notNull(),
    criteriaVersion: text('criteria_version').notNull(),
    model: text('model').notNull(),
    severity: text('severity').$type<ReportedSeverity>(),
    intents: jsonb('intents').$type<ReviewIntent[]>().default([]).notNull(),
    uncovered: boolean('uncovered').default(false).notNull(),
    probabilities: jsonb('probabilities').$type<Record<string, number>>().default({}).notNull(),
    manualOverride: jsonb('manual_override').$type<ClassificationOverride>(),
    overrideInputHash: text('override_input_hash'),
    needsRecheck: boolean('needs_recheck').default(false).notNull(),
    discoveredAt: timestamp('discovered_at'),
    analyzedAt: timestamp('analyzed_at').defaultNow().notNull(),
  },
  (table) => [index('review_analyses_org_app_idx').on(table.organizationId, table.appId)],
)

export const reviewTopicAssignments = pgTable(
  'review_topic_assignments',
  {
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    topicId: uuid('topic_id')
      .notNull()
      .references(() => reviewTopics.id, { onDelete: 'cascade' }),
    probability: doublePrecision('probability').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.reviewId, table.topicId] }),
    index('review_topic_assignments_topic_idx').on(table.topicId),
  ],
)

export const reviewAnalysisEvents = pgTable(
  'review_analysis_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    reviewId: uuid('review_id').references(() => reviews.id, { onDelete: 'set null' }),
    topicId: uuid('topic_id').references(() => reviewTopics.id, { onDelete: 'set null' }),
    actorUserId: text('actor_user_id'),
    action: text('action').notNull(),
    metadata:
      jsonb('metadata').$type<Record<string, string | number | boolean | string[] | null>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('review_analysis_events_org_app_idx').on(table.organizationId, table.appId)],
)
