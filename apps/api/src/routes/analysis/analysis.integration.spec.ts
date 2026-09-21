import { randomUUID } from 'node:crypto'

import { reviewAnalysisCriteriaVersion } from '@reviewinbox/ai'
import {
  analysisResponseSchema,
  analysisReviewSchema,
  topicListResponseSchema,
} from '@reviewinbox/contracts'
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
} from '@reviewinbox/db'
import { eq } from 'drizzle-orm'
import type { Context } from 'hono'
import { afterAll, describe, expect, it, vi } from 'vitest'

import type { AnalysisRouteDependencies } from './index'
import { createAnalysisRoutes } from './index'

const databaseUrl = process.env['ANALYSIS_TEST_DATABASE_URL']
const database = createDatabase(databaseUrl ?? 'postgres://unused-analysis-test')

type TestDatabase = typeof database
type Fixture = ReturnType<typeof createFixtureIds>

afterAll(async () => {
  if (databaseUrl !== undefined) {
    await closeDatabase(database)
  }
})

describe.skipIf(databaseUrl === undefined)('analysis dashboard routes', () => {
  it('aggregates the full history and returns a bounded review page', async () => {
    await withFixture(async (fixture) => {
      const { routes } = createRouteHarness(fixture)
      const firstPageResponse = await routes.request(
        `/api/analysis?appId=${fixture.appId}&page=1&pageSize=2`,
      )
      expect(firstPageResponse.status).toBe(200)
      const firstPage = analysisResponseSchema.parse(await firstPageResponse.json())

      expect(firstPage).toMatchObject({
        enabled: false,
        total: 4,
        analyzed: 3,
        page: 1,
        pageSize: 2,
      })
      expect(firstPage.reviews).toHaveLength(2)
      expect(firstPage.severities).toEqual(
        expect.arrayContaining([
          { severity: 'blocking', count: 1 },
          { severity: 'minor', count: 1 },
          { severity: 'unknown', count: 2 },
        ]),
      )

      const approvedTopic = firstPage.topics.find((topic) => topic.id === fixture.approvedTopicId)
      const pendingTopic = firstPage.topics.find((topic) => topic.id === fixture.pendingTopicId)
      expect(approvedTopic?.reviewCount).toBe(1)
      expect(pendingTopic?.reviewCount).toBe(2)
      expect(firstPage.topics.some((topic) => topic.id === fixture.rejectedTopicId)).toBe(false)

      const secondPageResponse = await routes.request(
        `/api/analysis?appId=${fixture.appId}&page=2&pageSize=2`,
      )
      const secondPage = analysisResponseSchema.parse(await secondPageResponse.json())
      expect(secondPage.reviews).toHaveLength(2)
      expect(new Set(secondPage.reviews.map((review) => review.id))).not.toEqual(
        new Set(firstPage.reviews.map((review) => review.id)),
      )
    })
  })
})

describe.skipIf(databaseUrl === undefined)('invalidated automatic analyses', () => {
  it.each(['pending', 'processing', 'failed', 'skipped'] as const)(
    'hides invalidated automatic classification while %s',
    async (status) => {
      await withFixture(async (fixture) => {
        await database
          .update(reviews)
          .set({ analysisStatus: status, body: '' })
          .where(eq(reviews.id, fixture.firstReviewId))
        await database
          .update(reviewAnalyses)
          .set({ intents: ['report_problem'], uncovered: true })
          .where(eq(reviewAnalyses.reviewId, fixture.firstReviewId))
        const { routes } = createRouteHarness(fixture)
        const dashboard = analysisResponseSchema.parse(
          await (await routes.request(`/api/analysis?appId=${fixture.appId}`)).json(),
        )
        expect(dashboard.analyzed).toBe(2)
        expect(dashboard.severities.some((item) => item.severity === 'blocking')).toBe(false)
        expect(dashboard.trend.every((item) => item.blocking === 0)).toBe(true)
        expect(
          dashboard.topics.find((topic) => topic.id === fixture.approvedTopicId)?.reviewCount,
        ).toBe(0)
        const expected = {
          severity: null,
          intents: [],
          topics: [],
          uncovered: false,
          analyzedAt: null,
        }
        expect(
          dashboard.reviews.find((review) => review.id === fixture.firstReviewId),
        ).toMatchObject(expected)
        const detail = analysisReviewSchema.parse(
          await (await routes.request(`/api/analysis/reviews/${fixture.firstReviewId}`)).json(),
        )
        expect(detail).toMatchObject(expected)
        await Promise.all(
          ['severity=blocking', 'intent=report_problem', `topicId=${fixture.approvedTopicId}`].map(
            async (filter) => {
              const filtered = analysisResponseSchema.parse(
                await (
                  await routes.request(`/api/analysis?appId=${fixture.appId}&${filter}`)
                ).json(),
              )
              expect(filtered.total).toBe(0)
              expect(filtered.reviews).toEqual([])
            },
          ),
        )
      })
    },
  )
})

describe.skipIf(databaseUrl === undefined)('catalogue fingerprint freshness', () => {
  it('hides a completed analysis when the App catalogue version is newer', async () => {
    await withFixture(async (fixture) => {
      await database
        .update(apps)
        .set({ analysisCatalogVersion: 2 })
        .where(eq(apps.id, fixture.appId))
      await database
        .update(reviewAnalyses)
        .set({ intents: ['report_problem'] })
        .where(eq(reviewAnalyses.reviewId, fixture.firstReviewId))
      const { routes } = createRouteHarness(fixture)
      const result = await readInvalidatedAutomaticAnalysis(routes, fixture)
      expect(result.dashboard.analyzed).toBe(0)
      expect(result.invalidatedDashboardReview).toMatchObject({
        severity: null,
        intents: [],
        topics: [],
        uncovered: false,
        analyzedAt: null,
      })
      expect(result.detail).toMatchObject({
        severity: null,
        intents: [],
        topics: [],
        uncovered: false,
        analyzedAt: null,
      })
      expect(result.filtered.total).toBe(0)
      expect(result.topicFiltered.total).toBe(0)
      expect(result.intentFiltered.total).toBe(0)
    })
  })
})

describe.skipIf(databaseUrl === undefined)('criteria fingerprint freshness', () => {
  it('hides a completed analysis when its criteria version is stale', async () => {
    await withFixture(async (fixture) => {
      await database
        .update(reviewAnalyses)
        .set({
          criteriaVersion: `${reviewAnalysisCriteriaVersion}-stale`,
          intents: ['report_problem'],
        })
        .where(eq(reviewAnalyses.reviewId, fixture.firstReviewId))
      const { routes } = createRouteHarness(fixture)
      const result = await readInvalidatedAutomaticAnalysis(routes, fixture)
      expect(result.dashboard.analyzed).toBe(2)
      expect(result.invalidatedDashboardReview).toMatchObject({
        severity: null,
        intents: [],
        topics: [],
        uncovered: false,
        analyzedAt: null,
      })
      expect(result.detail).toMatchObject({
        severity: null,
        intents: [],
        topics: [],
        uncovered: false,
        analyzedAt: null,
      })
      expect(result.filtered.total).toBe(0)
      expect(result.topicFiltered.total).toBe(0)
      expect(result.intentFiltered.total).toBe(0)
    })
  })
})

describe.skipIf(databaseUrl === undefined)('manual fingerprint freshness', () => {
  it('keeps manual corrections when both automatic fingerprints are stale', async () => {
    await withFixture(async (fixture) => {
      await database
        .update(apps)
        .set({ analysisCatalogVersion: 2 })
        .where(eq(apps.id, fixture.appId))
      await database
        .update(reviewAnalyses)
        .set({ criteriaVersion: `${reviewAnalysisCriteriaVersion}-stale` })
        .where(eq(reviewAnalyses.reviewId, fixture.manualReviewId))
      const { routes } = createRouteHarness(fixture)
      const detail = analysisReviewSchema.parse(
        await (await routes.request(`/api/analysis/reviews/${fixture.manualReviewId}`)).json(),
      )
      expect(detail).toMatchObject({ hasOverride: true, severity: null, needsRecheck: true })
      expect(detail.topics.map((topic) => topic.id)).toEqual([fixture.pendingTopicId])

      const dashboard = analysisResponseSchema.parse(
        await (
          await routes.request(
            `/api/analysis?appId=${fixture.appId}&topicId=${fixture.pendingTopicId}`,
          )
        ).json(),
      )
      expect(dashboard.total).toBe(1)
      expect(dashboard.reviews.map((review) => review.id)).toEqual([fixture.manualReviewId])
    })
  })
})

describe.skipIf(databaseUrl === undefined)('retained manual analyses', () => {
  it('retains manual classification for rechecking and never restores stale automatic values', async () => {
    await withFixture(async (fixture) => {
      await database
        .update(reviews)
        .set({ analysisStatus: 'pending', body: 'Changed Review' })
        .where(eq(reviews.id, fixture.manualReviewId))
      const { routes } = createRouteHarness(fixture)
      const detail = analysisReviewSchema.parse(
        await (await routes.request(`/api/analysis/reviews/${fixture.manualReviewId}`)).json(),
      )
      expect(detail).toMatchObject({ hasOverride: true, needsRecheck: true, severity: null })
      expect(detail.topics.map((topic) => topic.id)).toEqual([fixture.pendingTopicId])
      const dashboard = analysisResponseSchema.parse(
        await (
          await routes.request(
            `/api/analysis?appId=${fixture.appId}&topicId=${fixture.pendingTopicId}`,
          )
        ).json(),
      )
      expect(dashboard.total).toBe(2)
      expect(dashboard.reviews.find((review) => review.id === fixture.manualReviewId)).toEqual(
        detail,
      )
      const reset = analysisReviewSchema.parse(
        await (
          await routes.request(`/api/analysis/reviews/${fixture.manualReviewId}/override`, {
            method: 'DELETE',
          })
        ).json(),
      )
      expect(reset).toMatchObject({
        hasOverride: false,
        severity: null,
        intents: [],
        topics: [],
        analyzedAt: null,
      })
    })
  })

  it('keeps analysis and catalogue reads isolated to the active Organization', async () => {
    await withFixture(async (fixture) => {
      const { routes } = createRouteHarness(fixture)
      const dashboardResponse = await routes.request('/api/analysis')
      const dashboard = analysisResponseSchema.parse(await dashboardResponse.json())
      expect(dashboard.total).toBe(4)
      expect(dashboard.reviews.every((review) => review.appId === fixture.appId)).toBe(true)

      const foreignTopicsResponse = await routes.request(`/api/apps/${fixture.foreignAppId}/topics`)
      expect(foreignTopicsResponse.status).toBe(404)

      const foreignReviewResponse = await routes.request(
        `/api/analysis/reviews/${fixture.foreignReviewId}`,
      )
      expect(foreignReviewResponse.status).toBe(404)
    })
  })
})

async function readInvalidatedAutomaticAnalysis(
  routes: ReturnType<typeof createRouteHarness>['routes'],
  fixture: Fixture,
) {
  const dashboard = analysisResponseSchema.parse(
    await (await routes.request(`/api/analysis?appId=${fixture.appId}`)).json(),
  )
  const detail = analysisReviewSchema.parse(
    await (await routes.request(`/api/analysis/reviews/${fixture.firstReviewId}`)).json(),
  )
  const filtered = analysisResponseSchema.parse(
    await (await routes.request(`/api/analysis?appId=${fixture.appId}&severity=blocking`)).json(),
  )
  const topicFiltered = analysisResponseSchema.parse(
    await (
      await routes.request(
        `/api/analysis?appId=${fixture.appId}&topicId=${fixture.approvedTopicId}`,
      )
    ).json(),
  )
  const intentFiltered = analysisResponseSchema.parse(
    await (
      await routes.request(`/api/analysis?appId=${fixture.appId}&intent=report_problem`)
    ).json(),
  )
  return {
    dashboard,
    detail,
    filtered,
    topicFiltered,
    intentFiltered,
    invalidatedDashboardReview: dashboard.reviews.find(
      (review) => review.id === fixture.firstReviewId,
    ),
  }
}

describe.skipIf(databaseUrl === undefined)('analysis catalogue permissions', () => {
  it('does not grant catalogue management to a regular member', async () => {
    await withFixture(async (fixture) => {
      const { routes } = createRouteHarness(fixture, { role: 'member', managerAllowed: false })
      const topicsResponse = await routes.request(`/api/apps/${fixture.appId}/topics`)
      const topics = topicListResponseSchema.parse(await topicsResponse.json())
      expect(topics.canManage).toBe(false)

      const createResponse = await routes.request(`/api/apps/${fixture.appId}/topics`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ label: 'Members cannot create', description: 'No.' }),
      })
      expect(createResponse.status).toBe(403)
    })
  })
})

describe.skipIf(databaseUrl === undefined)('analysis catalogue mutations', () => {
  it('merges assignments without duplicate reviews and preserves aliases', async () => {
    await withFixture(async (fixture) => {
      const { routes } = createRouteHarness(fixture, { role: 'owner' })
      const response = await routes.request(
        `/api/apps/${fixture.appId}/topics/${fixture.sourceTopicId}/merge`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ targetTopicId: fixture.targetTopicId }),
        },
      )
      expect(response.status).toBe(200)

      const assignments = await database
        .select()
        .from(reviewTopicAssignments)
        .where(eq(reviewTopicAssignments.reviewId, fixture.firstReviewId))
      expect(
        assignments.filter((assignment) => assignment.topicId === fixture.targetTopicId),
      ).toHaveLength(1)
      expect(assignments.some((assignment) => assignment.topicId === fixture.sourceTopicId)).toBe(
        false,
      )

      const [source, target] = await Promise.all([
        database.query.reviewTopics.findFirst({
          where: eq(reviewTopics.id, fixture.sourceTopicId),
        }),
        database.query.reviewTopics.findFirst({
          where: eq(reviewTopics.id, fixture.targetTopicId),
        }),
      ])
      expect(source?.mergedIntoId).toBe(fixture.targetTopicId)
      expect(target?.aliases).toEqual(expect.arrayContaining(['Payments', 'Billing', 'Charge']))
      expect(target?.status).toBe('approved')
    })
  })

  it('rejects active assignments and supports returning to automatic classification', async () => {
    await withFixture(async (fixture) => {
      const { routes } = createRouteHarness(fixture, { role: 'owner' })
      const rejectResponse = await routes.request(
        `/api/apps/${fixture.appId}/topics/${fixture.pendingTopicId}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status: 'rejected' }),
        },
      )
      expect(rejectResponse.status).toBe(200)

      const pendingAssignments = await database
        .select()
        .from(reviewTopicAssignments)
        .where(eq(reviewTopicAssignments.topicId, fixture.pendingTopicId))
      expect(pendingAssignments).toHaveLength(0)

      const [manualAnalysis] = await database
        .select({ manualOverride: reviewAnalyses.manualOverride })
        .from(reviewAnalyses)
        .where(eq(reviewAnalyses.reviewId, fixture.manualReviewId))
      expect(manualAnalysis?.manualOverride?.topicIds).toEqual([])

      const beforeReset = analysisReviewSchema.parse(
        await (await routes.request(`/api/analysis/reviews/${fixture.manualReviewId}`)).json(),
      )
      expect(beforeReset).toMatchObject({ hasOverride: true, severity: null, topics: [] })

      const resetResponse = await routes.request(
        `/api/analysis/reviews/${fixture.manualReviewId}/override`,
        { method: 'DELETE' },
      )
      const afterReset = analysisReviewSchema.parse(await resetResponse.json())
      expect(afterReset).toMatchObject({ hasOverride: false, severity: null, topics: [] })
    })
  })
})

function createRouteHarness(
  fixture: Fixture,
  options: { role?: 'member' | 'owner'; managerAllowed?: boolean } = {},
) {
  const role = options.role ?? 'owner'
  const session = { organizationId: fixture.organizationId, role, userId: 'analysis-test-user' }
  const requireSession = vi
    .fn<AnalysisRouteDependencies['requireSession']>()
    .mockImplementation((_context: Context) => Promise.resolve({ ok: true as const, session }))
  const requireManagerSession = vi
    .fn<AnalysisRouteDependencies['requireManagerSession']>()
    .mockImplementation((_context: Context) => {
      if (options.managerAllowed === false) {
        return Promise.resolve({
          ok: false as const,
          response: new Response(
            JSON.stringify({ error: 'Organization Admin permission required.' }),
            { status: 403, headers: { 'content-type': 'application/json' } },
          ),
        })
      }
      return Promise.resolve({ ok: true as const, session })
    })
  return {
    routes: createAnalysisRoutes({
      database,
      requireSession,
      requireManagerSession,
      discoveryEnabled: () => false,
    }),
  }
}

async function withFixture<T>(callback: (fixture: Fixture) => Promise<T>): Promise<T> {
  const fixture = await createFixture(database)
  try {
    return await callback(fixture)
  } finally {
    await database.delete(organization).where(eq(organization.id, fixture.organizationId))
    await database.delete(organization).where(eq(organization.id, fixture.foreignOrganizationId))
  }
}

async function createFixture(db: TestDatabase) {
  const suffix = randomUUID()
  const fixture = createFixtureIds(suffix)
  await seedOrganizations(db, fixture)
  await seedAppsAndConnections(db, fixture)
  await seedReviews(db, fixture)
  await seedTopics(db, fixture)
  await seedAnalyses(db, fixture)
  await seedAssignments(db, fixture)
  return fixture
}

function createFixtureIds(suffix: string) {
  return {
    organizationId: `analysis-${suffix}`,
    foreignOrganizationId: `foreign-${suffix}`,
    appId: randomUUID(),
    foreignAppId: randomUUID(),
    connectionId: randomUUID(),
    foreignConnectionId: randomUUID(),
    firstReviewId: randomUUID(),
    manualReviewId: randomUUID(),
    thirdReviewId: randomUUID(),
    pendingReviewId: randomUUID(),
    foreignReviewId: randomUUID(),
    approvedTopicId: randomUUID(),
    pendingTopicId: randomUUID(),
    rejectedTopicId: randomUUID(),
    sourceTopicId: randomUUID(),
    targetTopicId: randomUUID(),
  }
}

async function seedOrganizations(db: TestDatabase, fixture: Fixture): Promise<void> {
  const now = new Date('2026-09-20T12:00:00.000Z')
  await db.insert(organization).values([
    {
      id: fixture.organizationId,
      name: 'Analysis Test Organization',
      slug: fixture.organizationId,
      createdAt: now,
    },
    {
      id: fixture.foreignOrganizationId,
      name: 'Foreign Test Organization',
      slug: fixture.foreignOrganizationId,
      createdAt: now,
    },
  ])
}

async function seedAppsAndConnections(db: TestDatabase, fixture: Fixture): Promise<void> {
  await db.insert(apps).values([
    { id: fixture.appId, organizationId: fixture.organizationId, name: 'Analysis Test App' },
    {
      id: fixture.foreignAppId,
      organizationId: fixture.foreignOrganizationId,
      name: 'Foreign App',
    },
  ])
  await db.insert(storeConnections).values([
    {
      id: fixture.connectionId,
      organizationId: fixture.organizationId,
      appId: fixture.appId,
      provider: 'apple_app_store',
    },
    {
      id: fixture.foreignConnectionId,
      organizationId: fixture.foreignOrganizationId,
      appId: fixture.foreignAppId,
      provider: 'google_play',
    },
  ])
}

async function seedReviews(db: TestDatabase, fixture: Fixture): Promise<void> {
  const now = new Date('2026-09-20T12:00:00.000Z')
  await db
    .insert(reviews)
    .values([
      reviewRow({
        id: fixture.firstReviewId,
        organizationId: fixture.organizationId,
        appId: fixture.appId,
        storeConnectionId: fixture.connectionId,
        reviewedAt: now,
      }),
      reviewRow({
        id: fixture.manualReviewId,
        organizationId: fixture.organizationId,
        appId: fixture.appId,
        storeConnectionId: fixture.connectionId,
        reviewedAt: new Date(now.getTime() - 1_000),
      }),
      reviewRow({
        id: fixture.thirdReviewId,
        organizationId: fixture.organizationId,
        appId: fixture.appId,
        storeConnectionId: fixture.connectionId,
        reviewedAt: new Date(now.getTime() - 2_000),
      }),
      {
        ...reviewRow({
          id: fixture.pendingReviewId,
          organizationId: fixture.organizationId,
          appId: fixture.appId,
          storeConnectionId: fixture.connectionId,
          reviewedAt: new Date(now.getTime() - 3_000),
        }),
        analysisStatus: 'pending' as const,
      },
      reviewRow({
        id: fixture.foreignReviewId,
        organizationId: fixture.foreignOrganizationId,
        appId: fixture.foreignAppId,
        storeConnectionId: fixture.foreignConnectionId,
        reviewedAt: now,
      }),
    ])
}

async function seedTopics(db: TestDatabase, fixture: Fixture): Promise<void> {
  await db
    .insert(reviewTopics)
    .values([
      topicRow({
        id: fixture.approvedTopicId,
        organizationId: fixture.organizationId,
        appId: fixture.appId,
        label: 'Checkout',
        status: 'approved',
        aliases: ['Purchase'],
      }),
      topicRow({
        id: fixture.pendingTopicId,
        organizationId: fixture.organizationId,
        appId: fixture.appId,
        label: 'Offline mode',
        status: 'pending',
      }),
      topicRow({
        id: fixture.rejectedTopicId,
        organizationId: fixture.organizationId,
        appId: fixture.appId,
        label: 'Old API',
        status: 'rejected',
      }),
      topicRow({
        id: fixture.sourceTopicId,
        organizationId: fixture.organizationId,
        appId: fixture.appId,
        label: 'Payment issue',
        status: 'approved',
        aliases: ['Charge'],
      }),
      topicRow({
        id: fixture.targetTopicId,
        organizationId: fixture.organizationId,
        appId: fixture.appId,
        label: 'Payments',
        status: 'approved',
        aliases: ['Billing'],
      }),
    ])
}

async function seedAnalyses(db: TestDatabase, fixture: Fixture): Promise<void> {
  await db
    .insert(reviewAnalyses)
    .values([
      analysisRow(fixture.firstReviewId, fixture.organizationId, fixture.appId, 'blocking'),
      {
        ...analysisRow(fixture.manualReviewId, fixture.organizationId, fixture.appId, 'degraded'),
        manualOverride: { topicIds: [fixture.pendingTopicId], intents: [], severity: null },
      },
      analysisRow(fixture.thirdReviewId, fixture.organizationId, fixture.appId, 'minor'),
      analysisRow(
        fixture.foreignReviewId,
        fixture.foreignOrganizationId,
        fixture.foreignAppId,
        'critical',
      ),
    ])
}

async function seedAssignments(db: TestDatabase, fixture: Fixture): Promise<void> {
  await db.insert(reviewTopicAssignments).values([
    { reviewId: fixture.firstReviewId, topicId: fixture.approvedTopicId, probability: 0.9 },
    { reviewId: fixture.firstReviewId, topicId: fixture.sourceTopicId, probability: 0.8 },
    { reviewId: fixture.firstReviewId, topicId: fixture.targetTopicId, probability: 0.85 },
    { reviewId: fixture.thirdReviewId, topicId: fixture.pendingTopicId, probability: 0.7 },
  ])
}

function reviewRow(input: {
  id: string
  organizationId: string
  appId: string
  storeConnectionId: string
  reviewedAt: Date
}) {
  return {
    id: input.id,
    organizationId: input.organizationId,
    appId: input.appId,
    storeConnectionId: input.storeConnectionId,
    externalReviewId: input.id,
    authorDisplayName: 'Test Reviewer',
    rating: 3,
    title: 'A test Review',
    body: 'The test Review has enough text for analysis.',
    language: 'en',
    version: '1.0.0',
    country: 'FR',
    locale: 'en-FR',
    reviewedAt: input.reviewedAt,
    analysisStatus: 'completed' as const,
  }
}

function topicRow(input: {
  id: string
  organizationId: string
  appId: string
  label: string
  status: 'pending' | 'approved' | 'rejected'
  aliases?: string[]
}) {
  return {
    id: input.id,
    organizationId: input.organizationId,
    appId: input.appId,
    label: input.label,
    normalizedLabel: input.label.toLocaleLowerCase('en-US'),
    description: `${input.label} description`,
    aliases: input.aliases ?? [],
    status: input.status,
    origin: 'human' as const,
  }
}

function analysisRow(
  reviewId: string,
  organizationId: string,
  appId: string,
  severity: 'none' | 'minor' | 'degraded' | 'blocking' | 'critical',
) {
  return {
    reviewId,
    organizationId,
    appId,
    inputHash: `hash-${reviewId}`,
    criteriaVersion: 'review-analysis-v1',
    catalogVersion: 1,
    model: 'test',
    severity,
    intents: [],
    uncovered: false,
    probabilities: {},
    analyzedAt: new Date('2026-09-20T12:00:00.000Z'),
  }
}

it.skipIf(databaseUrl === undefined).each([
  ['pending', null],
  ['unavailable', null],
  ['resolved', '2.1.3'],
] as const)(
  'exposes the Apple version lookup state %s to the analysis UI',
  async (versionLookupStatus, version) => {
    await withFixture(async (fixture) => {
      await database
        .update(reviews)
        .set({ versionLookupStatus, version })
        .where(eq(reviews.id, fixture.firstReviewId))
      const { routes } = createRouteHarness(fixture)
      const result = analysisResponseSchema.parse(
        await (await routes.request(`/api/analysis?appId=${fixture.appId}`)).json(),
      )
      expect(result.reviews.find((review) => review.id === fixture.firstReviewId)).toMatchObject({
        versionLookupStatus,
        version,
      })
    })
  },
)
