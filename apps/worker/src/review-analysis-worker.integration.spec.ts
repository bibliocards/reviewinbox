import { randomUUID } from 'node:crypto'

import type { ReviewClassificationResult, TypeSafeReviewClassifier } from '@reviewinbox/ai'
import {
  apps,
  closeDatabase,
  createDatabase,
  organization,
  reviewAnalyses,
  reviewTopics,
  reviews,
  storeConnections,
  usageEvents,
} from '@reviewinbox/db'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { classifyReviewForAnalysis } from './review-analysis-worker'

const databaseUrl = process.env['ANALYSIS_TEST_DATABASE_URL']
const database = createDatabase(databaseUrl ?? 'postgres://unused-analysis-test')
const organizationId = `analysis-worker-test-${randomUUID()}`
const appId = randomUUID()
const storeConnectionId = randomUUID()

function result(): ReviewClassificationResult {
  return {
    model: 'fixture-jev',
    intents: [{ code: 'report_problem', probability: 0.99 }],
    severity: {
      code: 'critical',
      score: 4,
      confidence: 0.99,
      probabilities: { '0': 0, '1': 0, '2': 0, '3': 0, '4': 1 },
    },
    topicMatches: [],
    catalogueGapProbability: 0.99,
    usage: { inputTokens: 100, outputTokens: 0 },
  }
}

async function createReview(
  body = 'My collection disappeared after syncing.',
  title = 'Data loss',
) {
  const id = randomUUID()
  await database
    .insert(reviews)
    .values({
      id,
      organizationId,
      appId,
      storeConnectionId,
      externalReviewId: id,
      rating: 1,
      title,
      body,
      reviewedAt: new Date(),
    })
  return { organizationId, reviewId: id }
}

function classifier() {
  const classify = vi.fn<TypeSafeReviewClassifier['classify']>().mockResolvedValue(result())
  return { classify }
}

function storedAnalysis(reviewId: string) {
  return database.query.reviewAnalyses.findFirst({ where: eq(reviewAnalyses.reviewId, reviewId) })
}

async function requiredAnalysis(reviewId: string) {
  const analysis = await storedAnalysis(reviewId)
  if (analysis === undefined) {
    throw new Error('Expected a persisted analysis')
  }
  return analysis
}

beforeAll(async () => {
  if (databaseUrl === undefined) {
    return
  }
  await database
    .insert(organization)
    .values({
      id: organizationId,
      name: 'Analysis test',
      slug: organizationId,
      createdAt: new Date(),
    })
  await database.insert(apps).values({ id: appId, organizationId, name: 'Test App' })
  await database
    .insert(storeConnections)
    .values({ id: storeConnectionId, organizationId, appId, provider: 'apple_app_store' })
})
afterAll(async () => {
  if (databaseUrl === undefined) {
    return
  }
  await database.delete(organization).where(eq(organization.id, organizationId))
  await closeDatabase(database)
})

describe.skipIf(databaseUrl === undefined)('durable review analysis', () => {
  it('persists once and does not call the provider again for unchanged input', async () => {
    const input = await createReview()
    const provider = classifier()
    await expect(
      classifyReviewForAnalysis({ database, classifier: provider }, input),
    ).resolves.toMatchObject({ status: 'completed' })
    await expect(
      classifyReviewForAnalysis({ database, classifier: provider }, input),
    ).resolves.toMatchObject({ status: 'unchanged' })
    expect(provider.classify).toHaveBeenCalledTimes(1)
    expect(await storedAnalysis(input.reviewId)).toMatchObject({
      severity: 'critical',
      intents: ['report_problem'],
    })
  })

  it('keeps an explicit unknown human severity while retaining automatic values for reset', async () => {
    const input = await createReview()
    const provider = classifier()
    await classifyReviewForAnalysis({ database, classifier: provider }, input)
    const saved = await requiredAnalysis(input.reviewId)
    await database
      .update(reviewAnalyses)
      .set({
        manualOverride: { severity: null, intents: [], topicIds: [] },
        overrideInputHash: saved.inputHash,
      })
      .where(eq(reviewAnalyses.reviewId, input.reviewId))
    await database
      .update(reviews)
      .set({
        body: 'The collection is still missing after reinstalling.',
        analysisStatus: 'pending',
      })
      .where(eq(reviews.id, input.reviewId))
    await classifyReviewForAnalysis({ database, classifier: provider }, input)
    expect(await storedAnalysis(input.reviewId)).toMatchObject({
      severity: 'critical',
      intents: ['report_problem'],
      manualOverride: { severity: null, intents: [], topicIds: [] },
      needsRecheck: true,
    })
  })
})

describe.skipIf(databaseUrl === undefined)('review analysis concurrency', () => {
  it('discards an answer when the source review changes during the provider call', async () => {
    const input = await createReview()
    const provider = classifier()
    provider.classify.mockImplementationOnce(async () => {
      await database
        .update(reviews)
        .set({ body: 'The issue was fixed, thank you.' })
        .where(eq(reviews.id, input.reviewId))
      return result()
    })
    await expect(
      classifyReviewForAnalysis({ database, classifier: provider }, input),
    ).resolves.toMatchObject({ status: 'skipped', reason: 'stale' })
    expect(await storedAnalysis(input.reviewId)).toBeUndefined()
  })

  it('does not restore a topic rejected while classification was in flight', async () => {
    const input = await createReview()
    const topicId = randomUUID()
    await database
      .insert(reviewTopics)
      .values({
        id: topicId,
        organizationId,
        appId,
        label: 'Collection sync',
        normalizedLabel: `sync-${topicId}`,
        description: 'Syncing a collection',
        origin: 'human',
        status: 'approved',
      })
    const provider = classifier()
    provider.classify.mockImplementationOnce(async () => {
      await database.transaction(async (transaction) => {
        await transaction.update(apps).set({ analysisCatalogVersion: 2 }).where(eq(apps.id, appId))
        await transaction
          .update(reviewTopics)
          .set({ status: 'rejected' })
          .where(eq(reviewTopics.id, topicId))
      })
      return { ...result(), topicMatches: [{ topicId, probability: 1 }] }
    })
    await expect(
      classifyReviewForAnalysis({ database, classifier: provider }, input),
    ).resolves.toMatchObject({ status: 'skipped', reason: 'stale' })
    expect(await storedAnalysis(input.reviewId)).toBeUndefined()
  })

  it('classifies meaningful title-only reviews and skips reviews with no text', async () => {
    const provider = classifier()
    const titleOnly = await createReview('', 'The app no longer opens')
    await expect(
      classifyReviewForAnalysis({ database, classifier: provider }, titleOnly),
    ).resolves.toMatchObject({ status: 'completed' })
    const empty = await createReview('', '')
    await expect(
      classifyReviewForAnalysis({ database, classifier: provider }, empty),
    ).resolves.toMatchObject({ status: 'skipped' })
    expect(provider.classify).toHaveBeenCalledTimes(1)
  })

  it('isolates another organization before calling the provider or metering', async () => {
    const input = await createReview()
    const provider = classifier()
    await expect(
      classifyReviewForAnalysis(
        { database, classifier: provider },
        { ...input, organizationId: 'unrelated-org' },
      ),
    ).resolves.toMatchObject({ status: 'skipped', reason: 'not_found' })
    expect(provider.classify).not.toHaveBeenCalled()
    const consumed = await database.query.usageEvents.findMany({
      where: and(
        eq(usageEvents.organizationId, 'unrelated-org'),
        eq(usageEvents.type, 'managed_ai_review_classified'),
      ),
    })
    expect(consumed).toEqual([])
  })
})

describe.skipIf(databaseUrl === undefined)('analysis retry and discovery markers', () => {
  it('records the failure time used by the scanner cooldown', async () => {
    const input = await createReview()
    await database
      .update(reviews)
      .set({ updatedAt: new Date('2020-01-01') })
      .where(eq(reviews.id, input.reviewId))
    const provider = classifier()
    provider.classify.mockRejectedValueOnce(new Error('provider unavailable'))
    const started = Date.now()
    await expect(
      classifyReviewForAnalysis({ database, classifier: provider }, input),
    ).rejects.toThrow('provider unavailable')
    const row = await database.query.reviews.findFirst({ where: eq(reviews.id, input.reviewId) })
    expect(row?.analysisStatus).toBe('failed')
    expect(row?.updatedAt.getTime()).toBeGreaterThanOrEqual(started)
  })

  it('clears discovery eligibility only when source content changes', async () => {
    const input = await createReview()
    const provider = classifier()
    await classifyReviewForAnalysis({ database, classifier: provider }, input)
    const discoveredAt = new Date('2026-09-01T00:00:00.000Z')
    await database
      .update(reviewAnalyses)
      .set({ discoveredAt })
      .where(eq(reviewAnalyses.reviewId, input.reviewId))
    await database
      .update(reviews)
      .set({ analysisStatus: 'pending' })
      .where(eq(reviews.id, input.reviewId))
    await classifyReviewForAnalysis({ database, classifier: provider }, input)
    expect((await requiredAnalysis(input.reviewId)).discoveredAt).toEqual(discoveredAt)
    await database
      .update(reviews)
      .set({ body: 'Now I cannot sign in either.', analysisStatus: 'pending' })
      .where(eq(reviews.id, input.reviewId))
    await classifyReviewForAnalysis({ database, classifier: provider }, input)
    expect((await requiredAnalysis(input.reviewId)).discoveredAt).toBeNull()
  })
})
