import { type Database, reviews } from '@reviewinbox/db'
import type { NormalizedStoreReview } from '@reviewinbox/store-adapters'
import { and, eq, inArray, sql } from 'drizzle-orm'

export type StoreSyncedReviewsResult = {
  storedCount: number
  newReviewIds: string[]
}

export async function storeSyncedReviews(
  database: Database,
  scope: {
    organizationId: string
    appId: string
    storeConnectionId: string
  },
  syncedReviews: NormalizedStoreReview[],
): Promise<StoreSyncedReviewsResult> {
  if (syncedReviews.length === 0) {
    return { storedCount: 0, newReviewIds: [] }
  }

  const reviewsToStoreByExternalId = new Map(syncedReviews.map((review) => [review.externalReviewId, review] as const))
  const reviewsToStore = Array.from(reviewsToStoreByExternalId.values())

  return database.transaction(async (transaction) => {
    const externalReviewIds = reviewsToStore.map((review) => review.externalReviewId)
    const existingReviews = externalReviewIds.length
      ? await transaction
          .select({ externalReviewId: reviews.externalReviewId })
          .from(reviews)
          .where(and(eq(reviews.storeConnectionId, scope.storeConnectionId), inArray(reviews.externalReviewId, externalReviewIds)))
      : []
    const existingExternalReviewIds = new Set(existingReviews.map((review) => review.externalReviewId))
    const storedReviews = await transaction
      .insert(reviews)
      .values(
        reviewsToStore.map((review) => ({
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
        })),
      )
      .onConflictDoUpdate({
        target: [reviews.storeConnectionId, reviews.externalReviewId],
        set: {
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
        },
      })
      .returning({ id: reviews.id, externalReviewId: reviews.externalReviewId })

    const newReviewIds = storedReviews
      .filter((review) => !existingExternalReviewIds.has(review.externalReviewId))
      .map((review) => review.id)

    return {
      storedCount: storedReviews.length,
      newReviewIds,
    }
  })
}
