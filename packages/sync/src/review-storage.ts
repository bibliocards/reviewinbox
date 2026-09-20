import { canImportNewReview, type OrganizationLimitContext } from '@reviewinbox/billing'
import { publishedReplies, type Database, reviews, usageEvents } from '@reviewinbox/db'
import type { NormalizedStoreReview } from '@reviewinbox/store-adapters'
import { and, eq, inArray, sql } from 'drizzle-orm'

export type StoreSyncedReviewsResult = {
  storedCount: number
  newReviewIds: string[]
  limitReached: boolean
}

export type ReviewImportLimit = {
  context: OrganizationLimitContext
  monthlyImportedReviewCount: number
}

type ReviewTransaction = Parameters<Parameters<Database['transaction']>[0]>[0]
type StoredReview = { id: string; externalReviewId: string }
const reviewUpsertBatchSize = 1000

export function storeSyncedReviews(
  database: Database,
  scope: { organizationId: string; appId: string; storeConnectionId: string },
  syncedReviews: NormalizedStoreReview[],
  reviewImportLimit?: ReviewImportLimit,
): Promise<StoreSyncedReviewsResult> {
  if (syncedReviews.length === 0) {
    return Promise.resolve({ storedCount: 0, newReviewIds: [], limitReached: false })
  }

  const reviewsToStore = Array.from(
    new Map(syncedReviews.map((review) => [review.externalReviewId, review] as const)).values(),
  )
  return database.transaction(async (transaction) => {
    const existingExternalReviewIds = await loadExistingExternalReviewIds(
      transaction,
      scope,
      reviewsToStore,
    )
    const allowed = selectReviewsToStore(
      reviewsToStore,
      existingExternalReviewIds,
      reviewImportLimit,
    )
    if (allowed.reviews.length === 0) {
      return { storedCount: 0, newReviewIds: [], limitReached: allowed.limitReached }
    }

    const storedReviews = await persistReviewBatches({
      transaction,
      scope,
      reviewsToStore: allowed.reviews,
      index: 0,
      storedReviews: [],
    })
    const newReviewIds = storedReviews
      .filter((review) => !existingExternalReviewIds.has(review.externalReviewId))
      .map((review) => review.id)
    await recordImportedReviews(transaction, scope.organizationId, newReviewIds)
    return { storedCount: storedReviews.length, newReviewIds, limitReached: allowed.limitReached }
  })
}

async function loadExistingExternalReviewIds(
  transaction: ReviewTransaction,
  scope: { storeConnectionId: string },
  reviewsToStore: NormalizedStoreReview[],
) {
  const externalReviewIds = reviewsToStore.map((review) => review.externalReviewId)
  if (externalReviewIds.length === 0) {
    return new Set<string>()
  }
  const existingReviews = await transaction
    .select({ externalReviewId: reviews.externalReviewId })
    .from(reviews)
    .where(
      and(
        eq(reviews.storeConnectionId, scope.storeConnectionId),
        inArray(reviews.externalReviewId, externalReviewIds),
      ),
    )
    .for('update')
  return new Set(existingReviews.map((review) => review.externalReviewId))
}

function selectReviewsToStore(
  reviewsToStore: NormalizedStoreReview[],
  existingExternalReviewIds: Set<string>,
  reviewImportLimit: ReviewImportLimit | undefined,
) {
  const selectedReviews: NormalizedStoreReview[] = []
  let monthlyImportedReviewCount = reviewImportLimit?.monthlyImportedReviewCount ?? 0
  let limitReached = false
  for (const review of reviewsToStore) {
    const decision = decideReviewStorage(
      review,
      existingExternalReviewIds,
      reviewImportLimit,
      monthlyImportedReviewCount,
    )
    if (decision.allowed) {
      selectedReviews.push(review)
      monthlyImportedReviewCount += decision.countIncrement
    }
    limitReached ||= decision.limitReached
  }
  return { reviews: selectedReviews, limitReached }
}

function decideReviewStorage(
  review: NormalizedStoreReview,
  existingExternalReviewIds: Set<string>,
  reviewImportLimit: ReviewImportLimit | undefined,
  monthlyImportedReviewCount: number,
) {
  if (existingExternalReviewIds.has(review.externalReviewId) || reviewImportLimit === undefined) {
    return { allowed: true, countIncrement: 0, limitReached: false }
  }
  const decision = canImportNewReview(reviewImportLimit.context, monthlyImportedReviewCount)
  return {
    allowed: decision.allowed,
    countIncrement: decision.allowed ? 1 : 0,
    limitReached: !decision.allowed,
  }
}

type PersistReviewState = {
  transaction: ReviewTransaction
  scope: { organizationId: string; appId: string; storeConnectionId: string }
  reviewsToStore: NormalizedStoreReview[]
  index: number
  storedReviews: StoredReview[]
}

async function persistReviewBatches(state: PersistReviewState): Promise<StoredReview[]> {
  if (state.index >= state.reviewsToStore.length) {
    return state.storedReviews
  }
  const reviewBatch = state.reviewsToStore.slice(state.index, state.index + reviewUpsertBatchSize)
  const storedReviewBatch = await state.transaction
    .insert(reviews)
    .values(reviewBatch.map((review) => toReviewInsertValues(review, state.scope)))
    .onConflictDoUpdate({
      target: [reviews.storeConnectionId, reviews.externalReviewId],
      set: {
        ...reviewMetadataUpsertSet(),
        ...reviewReplyStateUpsertSet(),
        ...reviewAnalysisStateUpsertSet(),
      },
    })
    .returning({ id: reviews.id, externalReviewId: reviews.externalReviewId })
  return persistReviewBatches({
    ...state,
    index: state.index + reviewUpsertBatchSize,
    storedReviews: [...state.storedReviews, ...storedReviewBatch],
  })
}

function reviewAnalysisStateUpsertSet() {
  const inputChanged = sql`reviews.title IS DISTINCT FROM excluded.title
    OR reviews.body IS DISTINCT FROM excluded.body
    OR reviews.rating IS DISTINCT FROM excluded.rating
    OR reviews.version IS DISTINCT FROM excluded.version
    OR reviews.language IS DISTINCT FROM excluded.language`
  return {
    analysisStatus: sql`CASE WHEN ${inputChanged} THEN 'pending' ELSE reviews.analysis_status END`,
    analysisStartedAt: sql`CASE WHEN ${inputChanged} THEN NULL ELSE reviews.analysis_started_at END`,
    analysisFailureCode: sql`CASE WHEN ${inputChanged} THEN NULL ELSE reviews.analysis_failure_code END`,
  }
}

function reviewMetadataUpsertSet() {
  return {
    authorDisplayName: sql`excluded.author_display_name`,
    rating: sql`excluded.rating`,
    title: sql`excluded.title`,
    body: sql`excluded.body`,
    language: sql`excluded.language`,
    version: sql`excluded.version`,
    country: sql`excluded.country`,
    locale: sql`excluded.locale`,
    reviewedAt: sql`excluded.reviewed_at`,
    rawPayload: sql`excluded.raw_payload`,
    updatedAt: new Date(),
  }
}

function reviewReplyStateUpsertSet() {
  const reviewContentChanged = sql<boolean>`(
    ${reviews.rating} is distinct from excluded.rating
    or ${reviews.title} is distinct from excluded.title
    or ${reviews.body} is distinct from excluded.body
  )`
  const hasPublishedReply = sql<boolean>`exists (
    select 1
    from ${publishedReplies}
    where ${publishedReplies.reviewId} = ${reviews.id}
  )`
  return {
    replyStatus: sql`case
      when ${hasPublishedReply} and ${reviewContentChanged} then 'pending'::reply_status
      else ${reviews.replyStatus}
    end`,
    changedAfterReply: sql`case
      when ${hasPublishedReply} and ${reviewContentChanged} then true
      else ${reviews.changedAfterReply}
    end`,
    replyBaseline: sql`case
      when ${hasPublishedReply}
        and ${reviewContentChanged}
        and ${reviews.replyBaseline} is null
      then jsonb_build_object(
        'title', ${reviews.title},
        'body', ${reviews.body},
        'rating', ${reviews.rating}
      )
      else ${reviews.replyBaseline}
    end`,
  }
}

function toReviewInsertValues(
  review: NormalizedStoreReview,
  scope: { organizationId: string; appId: string; storeConnectionId: string },
) {
  return {
    organizationId: scope.organizationId,
    appId: scope.appId,
    storeConnectionId: scope.storeConnectionId,
    externalReviewId: review.externalReviewId,
    authorDisplayName: review.authorDisplayName,
    rating: review.rating,
    title: review.title,
    body: review.body,
    language: review.language,
    version: review.version,
    country: review.country,
    locale: review.locale,
    reviewedAt: new Date(review.reviewedAt),
    rawPayload: review.rawPayload,
  }
}

async function recordImportedReviews(
  transaction: ReviewTransaction,
  organizationId: string,
  newReviewIds: string[],
) {
  if (newReviewIds.length === 0) {
    return
  }
  await transaction
    .insert(usageEvents)
    .values({
      organizationId,
      type: 'review_imported',
      quantity: newReviewIds.length,
      occurredAt: new Date(),
    })
}
