import { getReviewAnalysisInputHash } from '@reviewinbox/ai'
import {
  analysisFiltersSchema,
  analysisReviewSchema,
  reviewTopicSchema,
  type AnalysisFilters,
  type ReviewTopic,
} from '@reviewinbox/contracts'
import {
  apps,
  reviewAnalyses,
  reviews,
  reviewTopicAssignments,
  reviewTopics,
  storeConnections,
} from '@reviewinbox/db'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import type { Context } from 'hono'
import { z } from 'zod'

import { database } from '../../db'

type Database = typeof database
type DatabaseLike = Pick<Database, 'select' | 'query'>

export type ReviewRow = {
  review: typeof reviews.$inferSelect
  app: typeof apps.$inferSelect
  connection: typeof storeConnections.$inferSelect
  analysis: typeof reviewAnalyses.$inferSelect | null
}

export function selectReviewRows(
  db: Database,
  organizationId: string,
  appIds: string[],
  filters: AnalysisFilters,
) {
  const conditions = [eq(reviews.organizationId, organizationId), inArray(reviews.appId, appIds)]
  if (filters.from !== undefined) {
    conditions.push(sql`${reviews.reviewedAt} >= ${new Date(filters.from)}`)
  }
  if (filters.to !== undefined) {
    conditions.push(sql`${reviews.reviewedAt} <= ${new Date(filters.to)}`)
  }
  if (filters.provider !== undefined) {
    conditions.push(eq(storeConnections.provider, filters.provider))
  }
  if (filters.version !== undefined) {
    conditions.push(eq(reviews.version, filters.version))
  }
  return db
    .select({ review: reviews, app: apps, connection: storeConnections, analysis: reviewAnalyses })
    .from(reviews)
    .innerJoin(apps, and(eq(apps.id, reviews.appId), eq(apps.organizationId, organizationId)))
    .innerJoin(storeConnections, eq(storeConnections.id, reviews.storeConnectionId))
    .leftJoin(reviewAnalyses, eq(reviewAnalyses.reviewId, reviews.id))
    .where(and(...conditions))
    .orderBy(desc(reviews.reviewedAt))
}

export async function selectReviewRow(db: DatabaseLike, organizationId: string, reviewId: string) {
  const rows = await db
    .select({ review: reviews, app: apps, connection: storeConnections, analysis: reviewAnalyses })
    .from(reviews)
    .innerJoin(apps, and(eq(apps.id, reviews.appId), eq(apps.organizationId, organizationId)))
    .innerJoin(storeConnections, eq(storeConnections.id, reviews.storeConnectionId))
    .leftJoin(reviewAnalyses, eq(reviewAnalyses.reviewId, reviews.id))
    .where(and(eq(reviews.id, reviewId), eq(reviews.organizationId, organizationId)))
    .limit(1)
  return rows[0]
}

export async function selectAssignments(db: Database, reviewIds: string[]) {
  if (reviewIds.length === 0) {
    return []
  }
  const chunks: string[][] = []
  for (let index = 0; index < reviewIds.length; index += 500) {
    chunks.push(reviewIds.slice(index, index + 500))
  }
  const results = await Promise.all(
    chunks.map((chunk) =>
      db
        .select({ assignment: reviewTopicAssignments, topic: reviewTopics })
        .from(reviewTopicAssignments)
        .innerJoin(reviewTopics, eq(reviewTopics.id, reviewTopicAssignments.topicId))
        .where(inArray(reviewTopicAssignments.reviewId, chunk)),
    ),
  )
  return results.flat()
}
export type AssignmentRow = Awaited<ReturnType<typeof selectAssignments>>[number]

export function findApp(
  db: Database,
  organizationId: string,
  appId: string | undefined,
): Promise<typeof apps.$inferSelect | undefined> {
  if (appId === undefined) {
    return db.query.apps.findFirst({ where: sql`false` })
  }
  return db.query.apps.findFirst({
    where: and(eq(apps.id, appId), eq(apps.organizationId, organizationId)),
  })
}
export function findTopic(db: Database, organizationId: string, appId: string, topicId: string) {
  return db.query.reviewTopics.findFirst({
    where: and(
      eq(reviewTopics.id, topicId),
      eq(reviewTopics.organizationId, organizationId),
      eq(reviewTopics.appId, appId),
    ),
  })
}

export function parseAnalysisFilters(
  context: Context,
): { ok: true; data: AnalysisFilters } | { ok: false; error: string } {
  const query = context.req.query()
  const result = analysisFiltersSchema.safeParse({
    ...query,
    appId: query['appId'],
    from: query['from'],
    to: query['to'],
    provider: query['provider'],
    version: query['version'],
    severity: query['severity'],
    intent: query['intent'],
    topicId: query['topicId'],
    topicStatus: query['topicStatus'],
    page: query['page'],
    pageSize: query['pageSize'],
  })
  if (result.success) {
    return { ok: true, data: result.data }
  }
  return { ok: false, error: result.error.issues[0]?.message ?? 'Invalid analysis filters.' }
}

export type AnalysisReviewView = z.infer<typeof analysisReviewSchema>
export function toAnalysisReview(
  row: ReviewRow,
  assignments: AssignmentRow[],
  topics: Map<string, typeof reviewTopics.$inferSelect>,
): AnalysisReviewView {
  const analysis = row.analysis
  const override = analysis?.manualOverride ?? null
  const automaticAnalysis = row.review.analysisStatus === 'completed' ? analysis : null
  const ids = effectiveTopicIds(
    row.review.id,
    override,
    automaticAnalysis === null ? [] : assignments,
  )
  const responseTopics = visibleTopics(ids, topics)
  const classification = effectiveClassification(automaticAnalysis, override)
  const flags = analysisFlags(row, analysis, override)
  return {
    id: row.review.id,
    appId: row.review.appId,
    appName: row.app.name,
    provider: row.connection.provider,
    title: row.review.title,
    body: row.review.body,
    rating: row.review.rating,
    version: row.review.version,
    reviewedAt: row.review.reviewedAt.toISOString(),
    status: row.review.analysisStatus,
    severity: classification.severity,
    intents: classification.intents,
    topics: responseTopics,
    hasOverride: override !== null,
    needsRecheck: flags.needsRecheck,
    uncovered: flags.uncovered,
    analyzedAt: flags.analyzedAt,
  }
}

function effectiveClassification(
  analysis: ReviewRow['analysis'],
  override: NonNullable<ReviewRow['analysis']>['manualOverride'] | null,
) {
  if (override !== null) {
    return { severity: override.severity, intents: override.intents }
  }
  return { severity: analysis?.severity ?? null, intents: analysis?.intents ?? [] }
}

function analysisFlags(
  row: ReviewRow,
  analysis: ReviewRow['analysis'],
  override: NonNullable<ReviewRow['analysis']>['manualOverride'] | null,
) {
  const automaticAnalysis = row.review.analysisStatus === 'completed' ? analysis : null
  return {
    needsRecheck: (analysis?.needsRecheck ?? false) || hasChangedInput(row, analysis, override),
    uncovered: automaticAnalysis?.uncovered ?? false,
    analyzedAt: automaticAnalysis?.analyzedAt.toISOString() ?? null,
  }
}

function hasChangedInput(
  row: ReviewRow,
  analysis: ReviewRow['analysis'],
  override: NonNullable<ReviewRow['analysis']>['manualOverride'] | null,
) {
  if (analysis === null || override === null) {
    return false
  }
  return (
    analysis.overrideInputHash
    !== getReviewAnalysisInputHash({
      title: row.review.title,
      body: row.review.body,
      rating: row.review.rating,
      version: row.review.version,
      language: row.review.language,
    })
  )
}

function effectiveTopicIds(
  reviewId: string,
  override: NonNullable<ReviewRow['analysis']>['manualOverride'] | null,
  assignments: AssignmentRow[],
): string[] {
  if (override !== null) {
    return override.topicIds
  }
  return assignments
    .filter((item) => item.assignment.reviewId === reviewId)
    .map((item) => item.topic.id)
}

function visibleTopics(
  ids: string[],
  topics: Map<string, typeof reviewTopics.$inferSelect>,
): ReviewTopic[] {
  return [...new Set(ids)].flatMap((id) => {
    const topic = topics.get(id)
    if (topic === undefined || topic.status === 'rejected') {
      return []
    }
    return [toTopicResponse(topic, [], topics)]
  })
}
export function toTopicResponse(
  topic: typeof reviewTopics.$inferSelect,
  reviewsForTopic: AnalysisReviewView[],
  _topics: Map<string, typeof reviewTopics.$inferSelect>,
): ReviewTopic {
  const matched = reviewsForTopic.filter((review) =>
    review.topics.some((candidate) => candidate.id === topic.id),
  )
  return reviewTopicSchema.parse({
    id: topic.id,
    appId: topic.appId,
    label: topic.label,
    description: topic.description,
    aliases: topic.aliases,
    status: topic.status,
    origin: topic.origin,
    mergedIntoId: topic.mergedIntoId,
    reviewCount: new Set(matched.map((review) => review.id)).size,
    examples: matched.slice(0, 3).map((review) => ({ id: review.id, body: review.body })),
  })
}
export function normalizeLabel(label: string): string {
  return label.trim().replaceAll(/\s+/gu, ' ').toLocaleLowerCase('en-US')
}
export function dedupeLabels(labels: string[]): string[] {
  const seen = new Set<string>()
  return labels.filter((label) => {
    const normalized = normalizeLabel(label)
    if (seen.has(normalized)) {
      return false
    }
    seen.add(normalized)
    return true
  })
}
export type AuditMetadataValue = string | number | boolean | string[] | null
export type AuditMetadata = Partial<
  Record<
    'topicIds' | 'intents' | 'severity' | 'label' | 'description' | 'status' | 'targetTopicId',
    AuditMetadataValue | undefined
  >
>
export function definedMetadata(value: AuditMetadata) {
  const metadata: Record<string, AuditMetadataValue> = {}
  for (const [key, item] of Object.entries(value)) {
    const parsed = z
      .union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()])
      .safeParse(item)
    if (parsed.success) {
      metadata[key] = parsed.data
    }
  }
  return metadata
}
