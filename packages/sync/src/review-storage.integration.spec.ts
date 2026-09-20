import { randomUUID } from 'node:crypto'

import {
  apps,
  closeDatabase,
  createDatabase,
  organization,
  publishedReplies,
  replyDrafts,
  reviews,
  storeConnections,
  user,
} from '@reviewinbox/db'
import type { NormalizedStoreReview } from '@reviewinbox/store-adapters'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { storeSyncedReviews } from './review-storage'

const databaseUrl = process.env['ANALYSIS_TEST_DATABASE_URL']
const database = createDatabase(databaseUrl ?? 'postgres://unused-sync-test')
const organizationId = `sync-analysis-${randomUUID()}`
const actorUserId = randomUUID()
const scope = { organizationId, appId: randomUUID(), storeConnectionId: randomUUID() }

beforeAll(async () => {
  if (databaseUrl === undefined) {
    return
  }
  await database
    .insert(organization)
    .values({ id: organizationId, name: 'Sync test', slug: organizationId, createdAt: new Date() })
  await database
    .insert(user)
    .values({ id: actorUserId, name: 'Test', email: `${actorUserId}@example.test` })
  await database.insert(apps).values({ id: scope.appId, organizationId, name: 'Sync test app' })
  await database
    .insert(storeConnections)
    .values({
      id: scope.storeConnectionId,
      organizationId,
      appId: scope.appId,
      provider: 'apple_app_store',
    })
})

afterAll(async () => {
  if (databaseUrl === undefined) {
    return
  }
  await database.delete(publishedReplies).where(eq(publishedReplies.organizationId, organizationId))
  await database.delete(organization).where(eq(organization.id, organizationId))
  await database.delete(user).where(eq(user.id, actorUserId))
  await closeDatabase(database)
})

describe.skipIf(databaseUrl === undefined)('sync reply state and analysis invalidation', () => {
  it('resurfaces changed replied Reviews and invalidates their analysis together', async () => {
    const { reviewId, source } = await createPublishedReview()
    const updated = { ...source, body: 'Now the app crashes.', rating: 1 }
    await storeSyncedReviews(database, scope, [updated])
    const stored = await database.query.reviews.findFirst({ where: eq(reviews.id, reviewId) })
    expect(stored).toMatchObject({
      body: updated.body,
      rating: 1,
      replyStatus: 'pending',
      changedAfterReply: true,
      replyBaseline: { title: source.title, body: source.body, rating: source.rating },
      analysisStatus: 'pending',
      analysisStartedAt: null,
      analysisFailureCode: null,
    })
  })

  it('preserves both states on identical sync and invalidates only analysis for a version change', async () => {
    const { reviewId, source } = await createPublishedReview()
    await storeSyncedReviews(database, scope, [source])
    expect(
      await database.query.reviews.findFirst({ where: eq(reviews.id, reviewId) }),
    ).toMatchObject({
      replyStatus: 'published',
      changedAfterReply: false,
      replyBaseline: null,
      analysisStatus: 'completed',
    })
    await storeSyncedReviews(database, scope, [{ ...source, version: '2.0' }])
    expect(
      await database.query.reviews.findFirst({ where: eq(reviews.id, reviewId) }),
    ).toMatchObject({
      replyStatus: 'published',
      changedAfterReply: false,
      replyBaseline: null,
      analysisStatus: 'pending',
      analysisStartedAt: null,
      analysisFailureCode: null,
    })
  })
})

async function createPublishedReview() {
  const reviewId = randomUUID()
  const replyDraftId = randomUUID()
  const source: NormalizedStoreReview = {
    externalReviewId: randomUUID(),
    title: 'Great app',
    body: 'Everything works.',
    rating: 5,
    language: 'en',
    version: '1.0',
    reviewedAt: new Date().toISOString(),
  }
  await database
    .insert(reviews)
    .values({
      ...scope,
      ...source,
      id: reviewId,
      reviewedAt: new Date(source.reviewedAt),
      replyStatus: 'published',
      analysisStatus: 'completed',
      analysisStartedAt: new Date(),
    })
  await database
    .insert(replyDrafts)
    .values({
      id: replyDraftId,
      organizationId,
      appId: scope.appId,
      reviewId,
      draftText: 'Thank you.',
      chosenReplyLanguage: 'en',
      model: 'fixture',
      promptVersion: 'fixture',
    })
  await database
    .insert(publishedReplies)
    .values({
      ...scope,
      reviewId,
      replyDraftId,
      actorUserId,
      provider: 'apple_app_store',
      replyText: 'Thank you.',
      publishedAt: new Date(),
    })
  return { reviewId, source }
}
