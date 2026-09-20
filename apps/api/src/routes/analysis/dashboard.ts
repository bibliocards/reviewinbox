import { loadTypeSafeConfig } from '@reviewinbox/config'
import { analysisResponseSchema, analysisReviewSchema } from '@reviewinbox/contracts'
import {
  apps,
  reviewTopics,
  reviews,
  reviewAnalyses,
  storeConnections,
  type Database,
} from '@reviewinbox/db'
import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import type { Context } from 'hono'

import { parseUuidParam } from '../../http/validation'
import { readAnalysisSummary } from './dashboard-query'
import type { AnalysisRouteDependencies } from './index'
import {
  findApp,
  parseAnalysisFilters,
  selectAssignments,
  selectReviewRow,
  toAnalysisReview,
} from './read-model'

export async function getAnalysis(context: Context, dependencies: AnalysisRouteDependencies) {
  const sessionResult = await dependencies.requireSession(context)
  if (!sessionResult.ok) {
    return sessionResult.response
  }
  const parsed = parseAnalysisFilters(context)
  if (!parsed.ok) {
    return context.json({ error: parsed.error }, 400)
  }
  const organizationId = sessionResult.session.organizationId
  if (
    parsed.data.appId !== undefined
    && (await findApp(dependencies.database, organizationId, parsed.data.appId)) === undefined
  ) {
    return context.json({ error: 'App not found.' }, 404)
  }
  const summary = await readAnalysisSummary(dependencies.database, organizationId, parsed.data)
  const pageReviews = await dashboardReviews(
    dependencies.database,
    organizationId,
    summary.reviewIds,
  )
  return context.json(
    analysisResponseSchema.parse({
      ...summary,
      reviews: pageReviews,
      enabled: loadTypeSafeConfig().apiKey !== undefined,
      discoveryEnabled: dependencies.discoveryEnabled(),
      canManage: ['owner', 'admin'].includes(sessionResult.session.role),
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
    }),
  )
}

async function dashboardReviews(db: Database, organizationId: string, ids: string[]) {
  if (ids.length === 0) {
    return []
  }
  const rows = await db
    .select({ review: reviews, app: apps, connection: storeConnections, analysis: reviewAnalyses })
    .from(reviews)
    .innerJoin(apps, eq(apps.id, reviews.appId))
    .innerJoin(storeConnections, eq(storeConnections.id, reviews.storeConnectionId))
    .leftJoin(reviewAnalyses, eq(reviewAnalyses.reviewId, reviews.id))
    .where(and(eq(reviews.organizationId, organizationId), inArray(reviews.id, ids)))
    .orderBy(desc(reviews.reviewedAt), asc(reviews.id))
  const topics = await db.query.reviewTopics.findMany({
    where: and(
      eq(reviewTopics.organizationId, organizationId),
      inArray(reviewTopics.appId, [...new Set(rows.map((row) => row.review.appId))]),
    ),
  })
  const assignments = await selectAssignments(db, ids)
  const topicsById = new Map(topics.map((topic) => [topic.id, topic]))
  return rows.map((row) => toAnalysisReview(row, assignments, topicsById))
}

export async function getAnalysisReview(context: Context, dependencies: AnalysisRouteDependencies) {
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
  const topics = await dependencies.database.query.reviewTopics.findMany({
    where: and(
      eq(reviewTopics.organizationId, row.review.organizationId),
      eq(reviewTopics.appId, row.review.appId),
    ),
  })
  const assignments = await selectAssignments(dependencies.database, [row.review.id])
  return context.json(
    analysisReviewSchema.parse(
      toAnalysisReview(row, assignments, new Map(topics.map((topic) => [topic.id, topic]))),
    ),
  )
}
