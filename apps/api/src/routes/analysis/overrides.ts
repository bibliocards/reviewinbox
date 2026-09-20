import { getReviewAnalysisInputHash } from '@reviewinbox/ai'
import { classificationOverrideSchema } from '@reviewinbox/contracts'
import { apps, reviewAnalyses, reviewAnalysisEvents, reviewTopics } from '@reviewinbox/db'
import { and, eq } from 'drizzle-orm'
import type { Context } from 'hono'
import { z } from 'zod'

import { database } from '../../db'
import { parseJsonBody, parseUuidParam } from '../../http/validation'
import { getAnalysisReview } from './dashboard'
import type { AnalysisRouteDependencies } from './index'
import { definedMetadata, selectReviewRow } from './read-model'
import { lockApp, lockReview } from './transaction-locks'

type Database = typeof database
type DatabaseTransaction = Parameters<Parameters<typeof database.transaction>[0]>[0]

export async function putOverride(context: Context, dependencies: AnalysisRouteDependencies) {
  const request = await prepareOverride(context, dependencies)
  if ('response' in request) {
    return request.response
  }
  const result = await persistOverride(dependencies.database, {
    existing: request.existing,
    organizationId: request.session.organizationId,
    reviewId: request.reviewId,
    override: request.override,
    actorUserId: request.session.userId,
  })
  if (result === 'invalid') {
    return context.json({ error: 'Override contains an unavailable Topic.' }, 409)
  }
  if (result === 'missing') {
    return context.json({ error: 'Review not found.' }, 404)
  }
  return getAnalysisReview(context, dependencies)
}

type ActiveSession = Extract<
  Awaited<ReturnType<AnalysisRouteDependencies['requireSession']>>,
  { ok: true }
>['session']
type PreparedOverride = {
  existing: NonNullable<Awaited<ReturnType<typeof selectReviewRow>>>
  override: z.infer<typeof classificationOverrideSchema>
  reviewId: string
  session: ActiveSession
}

async function prepareOverride(
  context: Context,
  dependencies: AnalysisRouteDependencies,
): Promise<PreparedOverride | { response: Response }> {
  const sessionResult = await dependencies.requireSession(context)
  if (!sessionResult.ok) {
    return { response: sessionResult.response }
  }
  const input = await parseOverrideInput(context)
  if ('response' in input) {
    return input
  }
  const existing = await selectReviewRow(
    dependencies.database,
    sessionResult.session.organizationId,
    input.reviewId,
  )
  if (existing === undefined) {
    return { response: context.json({ error: 'Review not found.' }, 404) }
  }
  return {
    existing,
    override: input.override,
    reviewId: input.reviewId,
    session: sessionResult.session,
  }
}

type ParsedOverrideInput =
  | { reviewId: string; override: z.infer<typeof classificationOverrideSchema> }
  | { response: Response }

async function parseOverrideInput(context: Context): Promise<ParsedOverrideInput> {
  const reviewIdResult = parseUuidParam(context, 'reviewId', 'Review')
  if (!reviewIdResult.ok) {
    return { response: reviewIdResult.response }
  }
  const bodyResult = await parseJsonBody(context, classificationOverrideSchema)
  if (!bodyResult.ok) {
    return { response: bodyResult.response }
  }
  return { reviewId: reviewIdResult.data, override: bodyResult.data }
}

function persistOverride(
  db: Database,
  input: {
    existing: NonNullable<Awaited<ReturnType<typeof selectReviewRow>>>
    organizationId: string
    reviewId: string
    override: z.infer<typeof classificationOverrideSchema>
    actorUserId: string
  },
) {
  return db.transaction(async (transaction: DatabaseTransaction) => {
    await lockApp(transaction, input.existing.review.appId)
    await lockReview(transaction, input.existing.review.id)
    const row = await selectReviewRow(transaction, input.organizationId, input.reviewId)
    if (row === undefined) {
      return 'missing' as const
    }
    const topics = await transaction.query.reviewTopics.findMany({
      where: and(
        eq(reviewTopics.organizationId, row.review.organizationId),
        eq(reviewTopics.appId, row.review.appId),
      ),
    })
    if (hasUnavailableTopic(topics, input.override.topicIds)) {
      return 'invalid' as const
    }
    const inputHash = getReviewAnalysisInputHash({
      title: row.review.title,
      body: row.review.body,
      rating: row.review.rating,
      version: row.review.version,
      language: row.review.language,
    })
    await saveOverride(transaction, {
      row,
      override: input.override,
      inputHash,
      actorUserId: input.actorUserId,
    })
    return 'updated' as const
  })
}

function hasUnavailableTopic(topics: Array<typeof reviewTopics.$inferSelect>, topicIds: string[]) {
  return topicIds.some((topicId) => {
    const topic = topics.find((candidate) => candidate.id === topicId)
    return topic === undefined || topic.status === 'rejected' || topic.mergedIntoId !== null
  })
}

async function saveOverride(
  transaction: DatabaseTransaction,
  input: {
    row: NonNullable<Awaited<ReturnType<typeof selectReviewRow>>>
    override: z.infer<typeof classificationOverrideSchema>
    inputHash: string
    actorUserId: string
  },
) {
  const app = await transaction.query.apps.findFirst({ where: eq(apps.id, input.row.review.appId) })
  await transaction
    .insert(reviewAnalyses)
    .values({
      reviewId: input.row.review.id,
      organizationId: input.row.review.organizationId,
      appId: input.row.review.appId,
      inputHash: input.inputHash,
      overrideInputHash: input.inputHash,
      criteriaVersion: 'manual-v1',
      catalogVersion: app?.analysisCatalogVersion ?? 1,
      model: 'manual',
      manualOverride: input.override,
      needsRecheck: false,
      analyzedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: reviewAnalyses.reviewId,
      set: {
        manualOverride: input.override,
        overrideInputHash: input.inputHash,
        needsRecheck: false,
      },
    })
  await transaction
    .insert(reviewAnalysisEvents)
    .values({
      organizationId: input.row.review.organizationId,
      appId: input.row.review.appId,
      reviewId: input.row.review.id,
      actorUserId: input.actorUserId,
      action: 'classification_override_set',
      metadata: definedMetadata(input.override),
    })
}

export async function deleteOverride(context: Context, dependencies: AnalysisRouteDependencies) {
  const sessionResult = await dependencies.requireSession(context)
  if (!sessionResult.ok) {
    return sessionResult.response
  }
  const reviewIdResult = parseUuidParam(context, 'reviewId', 'Review')
  if (!reviewIdResult.ok) {
    return reviewIdResult.response
  }
  const row = await selectReviewRow(
    dependencies.database,
    sessionResult.session.organizationId,
    reviewIdResult.data,
  )
  if (row === undefined) {
    return context.json({ error: 'Review not found.' }, 404)
  }
  await dependencies.database.transaction(async (transaction) => {
    await lockApp(transaction, row.review.appId)
    await lockReview(transaction, row.review.id)
    await transaction
      .update(reviewAnalyses)
      .set({ manualOverride: null, overrideInputHash: null, needsRecheck: false })
      .where(eq(reviewAnalyses.reviewId, row.review.id))
    await transaction
      .insert(reviewAnalysisEvents)
      .values({
        organizationId: row.review.organizationId,
        appId: row.review.appId,
        reviewId: row.review.id,
        actorUserId: sessionResult.session.userId,
        action: 'classification_override_removed',
      })
  })
  return getAnalysisReview(context, dependencies)
}
