import {
  apps,
  reviewAnalyses,
  reviewAnalysisEvents,
  reviewTopicAssignments,
  reviewTopics,
} from '@reviewinbox/db'
import { and, eq } from 'drizzle-orm'

import { database } from '../../db'
import type { AnalysisRouteDependencies } from './index'
import { definedMetadata, normalizeLabel, type AuditMetadata } from './read-model'
import { lockApp, lockTopicReviews } from './transaction-locks'

type DatabaseTransaction = Parameters<Parameters<typeof database.transaction>[0]>[0]
export type AppRow = typeof apps.$inferSelect
type TopicRow = typeof reviewTopics.$inferSelect
type TopicUpdateValues = Partial<typeof reviewTopics.$inferInsert> & { updatedAt: Date }

const discoveryCooldownMs = 24 * 60 * 60 * 1000

export function buildTopicUpdateValues(input: {
  label?: string | undefined
  description?: string | undefined
  status?: 'pending' | 'approved' | 'rejected' | undefined
}): TopicUpdateValues {
  const values: TopicUpdateValues = { updatedAt: new Date() }
  if (input.label !== undefined) {
    values.label = input.label
    values.normalizedLabel = normalizeLabel(input.label)
  }
  if (input.description !== undefined) {
    values.description = input.description
  }
  if (input.status !== undefined) {
    values.status = input.status
  }
  return values
}

export function persistTopicUpdate(
  db: AnalysisRouteDependencies['database'],
  input: {
    app: AppRow
    existing: TopicRow
    values: TopicUpdateValues
    rejecting: boolean
    actorUserId: string
    metadata: AuditMetadata
  },
) {
  return db.transaction(async (transaction) => {
    await lockApp(transaction, input.app.id)
    if (input.rejecting) {
      await lockTopicReviews(transaction, input.existing.id)
    }
    const [updated] = await transaction
      .update(reviewTopics)
      .set(input.values)
      .where(
        and(
          eq(reviewTopics.id, input.existing.id),
          eq(reviewTopics.organizationId, input.app.organizationId),
        ),
      )
      .returning()
    if (updated === undefined) {
      return null
    }
    if (input.rejecting) {
      await removeTopicReferences(transaction, input.app, input.existing.id)
    }
    await auditTopicUpdate(transaction, {
      app: input.app,
      topicId: input.existing.id,
      actorUserId: input.actorUserId,
      rejecting: input.rejecting,
      metadata: input.metadata,
    })
    return updated
  })
}

async function removeTopicReferences(
  transaction: DatabaseTransaction,
  app: AppRow,
  topicId: string,
) {
  await transaction
    .delete(reviewTopicAssignments)
    .where(eq(reviewTopicAssignments.topicId, topicId))
  const analyses = await transaction.query.reviewAnalyses.findMany({
    where: and(
      eq(reviewAnalyses.organizationId, app.organizationId),
      eq(reviewAnalyses.appId, app.id),
    ),
  })
  const updates = analyses.flatMap((analysis) => {
    const override = analysis.manualOverride
    if (override === undefined || override === null || !override.topicIds.includes(topicId)) {
      return []
    }
    return [
      transaction
        .update(reviewAnalyses)
        .set({
          manualOverride: {
            ...override,
            topicIds: override.topicIds.filter((id) => id !== topicId),
          },
        })
        .where(eq(reviewAnalyses.reviewId, analysis.reviewId)),
    ]
  })
  await Promise.all(updates)
}

async function auditTopicUpdate(
  transaction: DatabaseTransaction,
  input: {
    app: AppRow
    topicId: string
    actorUserId: string
    rejecting: boolean
    metadata: AuditMetadata
  },
) {
  await transaction
    .insert(reviewAnalysisEvents)
    .values({
      organizationId: input.app.organizationId,
      appId: input.app.id,
      topicId: input.topicId,
      actorUserId: input.actorUserId,
      action: input.rejecting ? 'topic_rejected' : 'topic_status_changed',
      metadata: definedMetadata(input.metadata),
    })
}

export function markDiscoveryRequested(db: AnalysisRouteDependencies['database'], app: AppRow) {
  return db.transaction(async (transaction) => {
    await lockApp(transaction, app.id)
    const current = await transaction.query.apps.findFirst({
      where: and(eq(apps.id, app.id), eq(apps.organizationId, app.organizationId)),
    })
    if (current === undefined) {
      return 'missing' as const
    }
    const recent =
      current.lastTopicDiscoveryAt !== null
      && Date.now() - current.lastTopicDiscoveryAt.getTime() < discoveryCooldownMs
    if (recent || current.topicDiscoveryRequestedAt !== null) {
      return 'cooldown' as const
    }
    await transaction
      .update(apps)
      .set({ topicDiscoveryRequestedAt: new Date() })
      .where(eq(apps.id, app.id))
    return 'queued' as const
  })
}
