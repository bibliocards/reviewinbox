import { randomUUID } from 'node:crypto'

import {
  reviewAnalysisCriteriaVersion,
  getReviewAnalysisInputHash,
  type ReviewClassificationResult,
  type TypeSafeReviewClassifier,
} from '@reviewinbox/ai'
import {
  apps,
  closeDatabase,
  createDatabase,
  organization,
  reviewAnalyses,
  reviewTopicAssignments,
  reviewTopics,
  reviews,
  storeConnections,
  usageEvents,
} from '@reviewinbox/db'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { classifyReviewForAnalysis, skipEmptyReviewIfUnchanged } from './review-analysis-worker'
import { loadTopicDiscoveryCandidates } from './topic-discovery-candidates'
import { loadDiscoveryContext, persistDiscoveryResults } from './topic-discovery-worker'

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

async function createUncoveredAnalysis(
  reviewId: string,
  options: {
    status?: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped'
    criteriaVersion?: string
    discoveredAt?: Date | null
  } = {},
) {
  await database
    .update(reviews)
    .set({ analysisStatus: options.status ?? 'completed' })
    .where(eq(reviews.id, reviewId))
  await database
    .insert(reviewAnalyses)
    .values({
      reviewId,
      organizationId,
      appId,
      inputHash: randomUUID(),
      criteriaVersion: options.criteriaVersion ?? reviewAnalysisCriteriaVersion,
      model: 'fixture-jev',
      severity: 'critical',
      intents: ['report_problem'],
      uncovered: true,
      probabilities: { catalogue_gap: 0.99 },
      discoveredAt: options.discoveredAt ?? null,
    })
}

async function requiredDiscoveryContext(payload: { organizationId: string; appId: string }) {
  const context = await loadDiscoveryContext(database, payload)
  if (context === undefined) {
    throw new Error('Expected discovery context')
  }
  return context
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
})

describe.skipIf(databaseUrl === undefined)('rejected topics during classification', () => {
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
        await transaction
          .update(reviewTopics)
          .set({ status: 'rejected' })
          .where(eq(reviewTopics.id, topicId))
      })
      return { ...result(), topicMatches: [{ topicId, probability: 1 }] }
    })
    await expect(
      classifyReviewForAnalysis({ database, classifier: provider }, input),
    ).resolves.toMatchObject({ status: 'completed' })
    expect((await requiredAnalysis(input.reviewId)).severity).toBe('critical')
    expect(
      await database.query.reviewTopicAssignments.findMany({
        where: eq(reviewTopicAssignments.reviewId, input.reviewId),
      }),
    ).toHaveLength(0)
  })
})

describe.skipIf(databaseUrl === undefined)('merged topics during classification', () => {
  it('does not restore a merged Topic from an in-flight classification', async () => {
    const input = await createReview()
    const sourceId = randomUUID()
    const targetId = randomUUID()
    await database.insert(reviewTopics).values([
      {
        id: sourceId,
        organizationId,
        appId,
        label: `Source ${sourceId}`,
        normalizedLabel: sourceId,
        description: 'Source Topic',
        origin: 'human',
        status: 'approved',
      },
      {
        id: targetId,
        organizationId,
        appId,
        label: `Target ${targetId}`,
        normalizedLabel: targetId,
        description: 'Target Topic',
        origin: 'human',
        status: 'approved',
      },
    ])
    const provider = classifier()
    provider.classify.mockImplementationOnce(async () => {
      await database
        .update(reviewTopics)
        .set({ mergedIntoId: targetId })
        .where(eq(reviewTopics.id, sourceId))
      return { ...result(), topicMatches: [{ topicId: sourceId, probability: 1 }] }
    })

    await expect(
      classifyReviewForAnalysis({ database, classifier: provider }, input),
    ).resolves.toMatchObject({ status: 'completed' })
    expect(
      await database.query.reviewTopicAssignments.findMany({
        where: eq(reviewTopicAssignments.reviewId, input.reviewId),
      }),
    ).toHaveLength(0)
  })
})

describe.skipIf(databaseUrl === undefined)('catalogue edits', () => {
  it('keeps a completed Review unchanged after a new Topic is added', async () => {
    const input = await createReview()
    const provider = classifier()
    await classifyReviewForAnalysis({ database, classifier: provider }, input)
    const topicId = randomUUID()
    await database
      .insert(reviewTopics)
      .values({
        id: topicId,
        organizationId,
        appId,
        label: `New topic ${topicId}`,
        normalizedLabel: topicId,
        description: 'A new Topic',
        origin: 'human',
        status: 'approved',
      })

    await expect(
      classifyReviewForAnalysis({ database, classifier: provider }, input),
    ).resolves.toMatchObject({ status: 'unchanged' })
    expect(provider.classify).toHaveBeenCalledTimes(1)
  })
})

describe.skipIf(databaseUrl === undefined)('review analysis input', () => {
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
  it('does not skip an empty snapshot after the source review changes', async () => {
    const input = await createReview('', '')
    const expectedInputHash = getReviewAnalysisInputHash({
      title: '',
      body: '',
      rating: 1,
      version: null,
      language: null,
    })
    await database
      .update(reviews)
      .set({ body: 'The review now contains meaningful content.' })
      .where(eq(reviews.id, input.reviewId))

    await expect(
      skipEmptyReviewIfUnchanged(database, { ...input, appId, expectedInputHash }),
    ).resolves.toBe(false)
    expect(
      await database.query.reviews.findFirst({ where: eq(reviews.id, input.reviewId) }),
    ).toMatchObject({ analysisStatus: 'pending' })
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
})

describe.skipIf(databaseUrl === undefined)('topic discovery candidate selection', () => {
  it('selects only fresh completed analyses for topic discovery', async () => {
    const baselineCandidates = await loadTopicDiscoveryCandidates({
      database,
      organizationId,
      appId,
      criteriaVersion: reviewAnalysisCriteriaVersion,
    })
    const baselineIds = new Set(baselineCandidates.map((candidate) => candidate.id))
    const fresh = await createReview()
    await createUncoveredAnalysis(fresh.reviewId)
    await Promise.all(
      (['pending', 'processing', 'failed', 'skipped'] as const).map(async (status) => {
        const review = await createReview()
        await createUncoveredAnalysis(review.reviewId, { status })
      }),
    )
    const oldCriteria = await createReview()
    await createUncoveredAnalysis(oldCriteria.reviewId, { criteriaVersion: 'review-analysis-old' })
    const discovered = await createReview()
    await createUncoveredAnalysis(discovered.reviewId, { discoveredAt: new Date() })

    const candidates = await loadTopicDiscoveryCandidates({
      database,
      organizationId,
      appId,
      criteriaVersion: reviewAnalysisCriteriaVersion,
    })

    expect(
      candidates
        .filter((candidate) => !baselineIds.has(candidate.id))
        .map((candidate) => candidate.id),
    ).toEqual([fresh.reviewId])
  })
})

describe.skipIf(databaseUrl === undefined)('analysis discovery markers', () => {
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

  it('keeps a newer analysis revision when an older provider call returns', async () => {
    const input = await createReview()
    const provider = classifier()
    await classifyReviewForAnalysis({ database, classifier: provider }, input)
    const newerAnalyzedAt = new Date(Date.now() + 1_000)
    provider.classify.mockImplementationOnce(async () => {
      await database
        .update(reviewAnalyses)
        .set({ analyzedAt: newerAnalyzedAt, model: 'newer-worker' })
        .where(eq(reviewAnalyses.reviewId, input.reviewId))
      return result()
    })
    await database
      .update(reviews)
      .set({ analysisStatus: 'pending' })
      .where(eq(reviews.id, input.reviewId))

    await expect(
      classifyReviewForAnalysis({ database, classifier: provider }, input),
    ).resolves.toMatchObject({ status: 'skipped', reason: 'stale' })
    expect(await requiredAnalysis(input.reviewId)).toMatchObject({
      model: 'newer-worker',
      analyzedAt: newerAnalyzedAt,
    })
    expect(
      await database.query.reviews.findFirst({ where: eq(reviews.id, input.reviewId) }),
    ).toMatchObject({ analysisStatus: 'pending' })
  })
})

describe.skipIf(databaseUrl === undefined)('discovery persistence races', () => {
  it('rejects discovery results when a candidate analysis changes in flight', async () => {
    const input = await createReview()
    await createUncoveredAnalysis(input.reviewId)
    const payload = { organizationId, appId }
    const context = await requiredDiscoveryContext(payload)
    const analyzedAt = new Date(Date.now() + 1_000)
    await database
      .update(reviewAnalyses)
      .set({ analyzedAt })
      .where(eq(reviewAnalyses.reviewId, input.reviewId))
    const beforeUsage = await database.query.usageEvents.findMany({
      where: and(
        eq(usageEvents.organizationId, organizationId),
        eq(usageEvents.type, 'managed_ai_topic_discovery'),
      ),
    })

    await expect(
      persistDiscoveryResults(database, payload, context, [
        { label: `Stale proposal ${randomUUID()}`, description: 'Stale result.' },
      ]),
    ).rejects.toThrow('topic_discovery_candidates_stale')
    expect(
      await database.query.reviewTopics.findMany({ where: eq(reviewTopics.appId, appId) }),
    ).not.toContainEqual(expect.objectContaining({ description: 'Stale result.' }))
    expect(
      await database.query.usageEvents.findMany({
        where: and(
          eq(usageEvents.organizationId, organizationId),
          eq(usageEvents.type, 'managed_ai_topic_discovery'),
        ),
      }),
    ).toHaveLength(beforeUsage.length)
    expect((await requiredAnalysis(input.reviewId)).discoveredAt).toBeNull()
  })

  it('rejects discovery results when a candidate source changes in flight', async () => {
    const input = await createReview()
    await createUncoveredAnalysis(input.reviewId)
    const payload = { organizationId, appId }
    const context = await requiredDiscoveryContext(payload)
    await database
      .update(reviews)
      .set({ body: 'The source changed while discovery was running.', analysisStatus: 'pending' })
      .where(eq(reviews.id, input.reviewId))

    await expect(
      persistDiscoveryResults(database, payload, context, [
        { label: `Stale source ${randomUUID()}`, description: 'Stale source result.' },
      ]),
    ).rejects.toThrow('topic_discovery_candidates_stale')
    expect(
      await database.query.reviewTopics.findMany({ where: eq(reviewTopics.appId, appId) }),
    ).not.toContainEqual(expect.objectContaining({ description: 'Stale source result.' }))
    expect((await requiredAnalysis(input.reviewId)).discoveredAt).toBeNull()
  })
})
