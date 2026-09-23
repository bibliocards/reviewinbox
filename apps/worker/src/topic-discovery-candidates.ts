import { reviewAnalyses, reviews, type Database } from '@reviewinbox/db'
import { and, desc, eq, isNull } from 'drizzle-orm'

export const topicDiscoveryCandidateBatchSize = 50

export type TopicDiscoveryCandidateInput = {
  database: Database
  organizationId: string
  appId: string
  criteriaVersion: string
}

export function loadTopicDiscoveryCandidates(input: TopicDiscoveryCandidateInput) {
  return input.database
    .select({
      id: reviews.id,
      title: reviews.title,
      body: reviews.body,
      rating: reviews.rating,
      version: reviews.version,
      language: reviews.language,
      analysisInputHash: reviewAnalyses.inputHash,
      analysisAnalyzedAt: reviewAnalyses.analyzedAt,
    })
    .from(reviews)
    .innerJoin(reviewAnalyses, eq(reviewAnalyses.reviewId, reviews.id))
    .where(
      and(
        eq(reviews.appId, input.appId),
        eq(reviews.organizationId, input.organizationId),
        eq(reviews.analysisStatus, 'completed'),
        eq(reviewAnalyses.criteriaVersion, input.criteriaVersion),
        eq(reviewAnalyses.uncovered, true),
        isNull(reviewAnalyses.discoveredAt),
      ),
    )
    .orderBy(desc(reviews.reviewedAt))
    .limit(topicDiscoveryCandidateBatchSize)
}
