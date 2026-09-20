import { reviewTopicAssignments } from '@reviewinbox/db'
import { eq, sql } from 'drizzle-orm'

import { database } from '../../db'

type DatabaseTransaction = Parameters<Parameters<typeof database.transaction>[0]>[0]

export async function lockApp(transaction: DatabaseTransaction, appId: string): Promise<void> {
  await transaction.execute(sql`select id from apps where id = ${appId} for update`)
}

export async function lockReview(
  transaction: DatabaseTransaction,
  reviewId: string,
): Promise<void> {
  await transaction.execute(sql`select id from reviews where id = ${reviewId} for update`)
}

export async function lockTopicReviews(
  transaction: DatabaseTransaction,
  topicId: string,
): Promise<void> {
  const assignments = await transaction.query.reviewTopicAssignments.findMany({
    where: eq(reviewTopicAssignments.topicId, topicId),
  })
  await Promise.all(assignments.map((assignment) => lockReview(transaction, assignment.reviewId)))
}
