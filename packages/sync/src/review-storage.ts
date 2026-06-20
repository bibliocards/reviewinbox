import { type Database, reviews } from '@reviewinbox/db'
import type { NormalizedStoreReview } from '@reviewinbox/store-adapters'
import { and, eq, inArray } from 'drizzle-orm'

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
  return database.transaction(async (transaction) => {
    const externalReviewIds = syncedReviews.map((review) => review.externalReviewId)
    const existingReviews = externalReviewIds.length
      ? await transaction
          .select({ externalReviewId: reviews.externalReviewId })
          .from(reviews)
          .where(and(eq(reviews.storeConnectionId, scope.storeConnectionId), inArray(reviews.externalReviewId, externalReviewIds)))
      : []
    const existingExternalReviewIds = new Set(existingReviews.map((review) => review.externalReviewId))
    const newReviewIds: string[] = []
    let storedCount = 0

    for (const review of syncedReviews) {
      const [stored] = await transaction
        .insert(reviews)
        .values({
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
        })
        .onConflictDoUpdate({
          target: [reviews.storeConnectionId, reviews.externalReviewId],
          set: {
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
            updatedAt: new Date(),
          },
        })
        .returning({ id: reviews.id, externalReviewId: reviews.externalReviewId })

      if (stored) {
        storedCount += 1
        if (!existingExternalReviewIds.has(stored.externalReviewId)) {
          newReviewIds.push(stored.id)
        }
      }
    }

    return { storedCount, newReviewIds }
  })
}
