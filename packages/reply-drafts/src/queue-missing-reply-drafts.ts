import { apps, type Database, replyDrafts, reviews, storeConnections } from '@reviewinbox/db'
import { and, count, eq, inArray, isNull, sql } from 'drizzle-orm'

const queueableReplyStatuses = ['pending', 'failed'] as const
const maxQueuedReviewsPerRequest = 500

export type QueueMissingReplyDraftReviewsResult =
  | { status: 'selected'; reviewIds: string[]; skippedCount: number }
  | { status: 'app_not_found' }
  | { status: 'auto_draft_disabled' }

export async function selectMissingReplyDraftReviews(input: {
  database: Database
  organizationId: string
  appId: string
}): Promise<QueueMissingReplyDraftReviewsResult> {
  const app = await input.database.query.apps.findFirst({
    columns: { id: true, autoDraftEnabled: true },
    where: and(eq(apps.id, input.appId), eq(apps.organizationId, input.organizationId)),
  })

  if (!app) {
    return { status: 'app_not_found' }
  }

  if (!app.autoDraftEnabled) {
    return { status: 'auto_draft_disabled' }
  }

  const [draftableCount] = await input.database
    .select({ count: count() })
    .from(reviews)
    .where(baseReviewScope(input.organizationId, input.appId))

  const eligibleRows = await input.database
    .select({ reviewId: reviews.id })
    .from(reviews)
    .innerJoin(
      storeConnections,
      and(eq(reviews.storeConnectionId, storeConnections.id), eq(storeConnections.organizationId, input.organizationId)),
    )
    .leftJoin(replyDrafts, eq(reviews.id, replyDrafts.reviewId))
    .where(
      and(
        baseReviewScope(input.organizationId, input.appId),
        eq(storeConnections.status, 'active'),
        isNull(replyDrafts.id),
        sql`trim(${reviews.body}) <> ''`,
      ),
    )
    .limit(maxQueuedReviewsPerRequest)

  const reviewIds = eligibleRows.map((row) => row.reviewId)
  const draftableReviewCount = draftableCount?.count ?? 0

  return {
    status: 'selected',
    reviewIds,
    skippedCount: draftableReviewCount - reviewIds.length,
  }
}

function baseReviewScope(organizationId: string, appId: string) {
  return and(
    eq(reviews.organizationId, organizationId),
    eq(reviews.appId, appId),
    inArray(reviews.replyStatus, [...queueableReplyStatuses]),
  )
}
