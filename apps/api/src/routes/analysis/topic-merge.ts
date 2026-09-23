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
import { definedMetadata, dedupeLabels, type AuditMetadata } from './read-model'
import { lockApp, lockReview } from './transaction-locks'

type DatabaseTransaction = Parameters<Parameters<typeof database.transaction>[0]>[0]
type AppRow = typeof apps.$inferSelect
type TopicRow = typeof reviewTopics.$inferSelect
type MergeInput = { app: AppRow; sourceId: string; targetId: string; actorUserId: string }

export type MergeResult =
  | { kind: 'merged'; target: TopicRow }
  | { kind: 'same' | 'not_found' | 'target_rejected' | 'already_merged' }

export function persistTopicMerge(
  db: AnalysisRouteDependencies['database'],
  input: MergeInput,
): Promise<MergeResult> {
  return db.transaction((transaction) => mergeTopicTransaction(transaction, input))
}

async function mergeTopicTransaction(
  transaction: DatabaseTransaction,
  input: MergeInput,
): Promise<MergeResult> {
  await lockApp(transaction, input.app.id)
  const topics = await transaction.query.reviewTopics.findMany({
    where: and(
      eq(reviewTopics.organizationId, input.app.organizationId),
      eq(reviewTopics.appId, input.app.id),
    ),
  })
  const source = topics.find((topic) => topic.id === input.sourceId)
  const target = topics.find((topic) => topic.id === input.targetId)
  const validation = validateMerge(source, target)
  if (validation !== 'merged') {
    return { kind: validation }
  }
  if (source === undefined || target === undefined) {
    return { kind: 'not_found' }
  }
  const mergeData = await loadMergeData(transaction, input.app, source.id)
  return completeMerge(transaction, { ...input, source, target, mergeData })
}

async function completeMerge(
  transaction: DatabaseTransaction,
  input: MergeInput & {
    source: TopicRow
    target: TopicRow
    mergeData: Awaited<ReturnType<typeof loadMergeData>>
  },
): Promise<MergeResult> {
  await lockMergeReviews(transaction, input.mergeData.assignments, input.mergeData.analyses)
  await moveAssignments(transaction, input.mergeData.assignments, input.target.id, input.source.id)
  await remapOverrides(transaction, input.mergeData.analyses, input.source.id, input.target.id)
  const aliases = dedupeLabels([
    ...input.target.aliases,
    input.target.label,
    ...input.source.aliases,
    input.source.label,
  ])
  await applyMergeRows(transaction, { ...input, aliases })
  return { kind: 'merged', target: { ...input.target, aliases } }
}

async function loadMergeData(transaction: DatabaseTransaction, app: AppRow, sourceId: string) {
  const [assignments, analyses] = await Promise.all([
    transaction.query.reviewTopicAssignments.findMany({
      where: eq(reviewTopicAssignments.topicId, sourceId),
    }),
    transaction.query.reviewAnalyses.findMany({
      where: and(
        eq(reviewAnalyses.organizationId, app.organizationId),
        eq(reviewAnalyses.appId, app.id),
      ),
    }),
  ])
  return { assignments, analyses }
}

function validateMerge(
  source: TopicRow | undefined,
  target: TopicRow | undefined,
): MergeResult['kind'] {
  if (source === undefined || target === undefined) {
    return 'not_found'
  }
  if (source.id === target.id) {
    return 'same'
  }
  if (target.status === 'rejected') {
    return 'target_rejected'
  }
  if (source.mergedIntoId !== null || target.mergedIntoId !== null) {
    return 'already_merged'
  }
  return 'merged'
}

async function lockMergeReviews(
  transaction: DatabaseTransaction,
  assignments: Array<{ reviewId: string }>,
  analyses: Array<{ reviewId: string }>,
) {
  const reviewIds = new Set([...assignments, ...analyses].map((item) => item.reviewId))
  await Promise.all([...reviewIds].map((reviewId) => lockReview(transaction, reviewId)))
}

async function moveAssignments(
  transaction: DatabaseTransaction,
  assignments: Array<{ reviewId: string; topicId: string; probability: number }>,
  targetId: string,
  sourceId: string,
) {
  await Promise.all(
    assignments.map((item) =>
      transaction
        .insert(reviewTopicAssignments)
        .values({ reviewId: item.reviewId, topicId: targetId, probability: item.probability })
        .onConflictDoNothing(),
    ),
  )
  await transaction
    .delete(reviewTopicAssignments)
    .where(eq(reviewTopicAssignments.topicId, sourceId))
}

async function remapOverrides(
  transaction: DatabaseTransaction,
  analyses: Array<{
    reviewId: string
    manualOverride: typeof reviewAnalyses.$inferSelect.manualOverride
  }>,
  sourceId: string,
  targetId: string,
) {
  const updates = analyses.flatMap((item) => {
    const override = item.manualOverride
    if (override === undefined || override === null || !override.topicIds.includes(sourceId)) {
      return []
    }
    const topicIds = [...new Set(override.topicIds.map((id) => (id === sourceId ? targetId : id)))]
    return [
      transaction
        .update(reviewAnalyses)
        .set({ manualOverride: { ...override, topicIds } })
        .where(eq(reviewAnalyses.reviewId, item.reviewId)),
    ]
  })
  await Promise.all(updates)
}

async function applyMergeRows(
  transaction: DatabaseTransaction,
  input: MergeInput & { aliases: string[] },
) {
  await transaction
    .update(reviewTopics)
    .set({ aliases: input.aliases, updatedAt: new Date() })
    .where(eq(reviewTopics.id, input.targetId))
  await transaction
    .update(reviewTopics)
    .set({ mergedIntoId: input.targetId, updatedAt: new Date() })
    .where(eq(reviewTopics.id, input.sourceId))
  await recordMergeAudit(transaction, {
    app: input.app,
    topicId: input.sourceId,
    actorUserId: input.actorUserId,
    metadata: { targetTopicId: input.targetId },
  })
}

async function recordMergeAudit(
  transaction: DatabaseTransaction,
  input: { app: AppRow; topicId: string; actorUserId: string; metadata: AuditMetadata },
) {
  await transaction
    .insert(reviewAnalysisEvents)
    .values({
      organizationId: input.app.organizationId,
      appId: input.app.id,
      topicId: input.topicId,
      actorUserId: input.actorUserId,
      action: 'topic_merged',
      metadata: definedMetadata(input.metadata),
    })
}
