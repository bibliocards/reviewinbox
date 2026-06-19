import { type Database, reviews } from '@reviewinbox/db'
import type { NormalizedStoreReview } from '@reviewinbox/store-adapters'

export async function storeSyncedReviews(
  database: Database,
  scope: {
    organizationId: string
    appId: string
    storeConnectionId: string
  },
  syncedReviews: NormalizedStoreReview[],
) {
  return database.transaction(async (transaction) => {
    let count = 0
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
        .returning({ id: reviews.id })

      if (stored) {
        count += 1
      }
    }

    return count
  })
}
