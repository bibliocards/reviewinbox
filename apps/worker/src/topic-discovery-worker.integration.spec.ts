import { randomUUID } from 'node:crypto'

import type { TopicDiscoveryProvider } from '@reviewinbox/ai'
import {
  apps,
  closeDatabase,
  createDatabase,
  organization,
  reviews,
  storeConnections,
} from '@reviewinbox/db'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { discoverTopicsForApp } from './topic-discovery-worker'

const databaseUrl = process.env['ANALYSIS_TEST_DATABASE_URL']
const database = createDatabase(databaseUrl ?? 'postgres://unused-analysis-test')
const organizationId = `discovery-backfill-${randomUUID()}`

beforeAll(async () => {
  if (databaseUrl === undefined) {
    return
  }
  await database
    .insert(organization)
    .values({
      id: organizationId,
      name: 'Discovery backfill test',
      slug: organizationId,
      createdAt: new Date(),
    })
})

afterAll(async () => {
  if (databaseUrl === undefined) {
    return
  }
  await database.delete(organization).where(eq(organization.id, organizationId))
  await closeDatabase(database)
})

async function createBackfill(analysisStatus: 'pending' | 'processing') {
  const appId = randomUUID()
  const connectionId = randomUUID()
  const reviewId = randomUUID()
  const requestedAt = new Date('2026-09-20T10:00:00.000Z')
  await database
    .insert(apps)
    .values({
      id: appId,
      organizationId,
      name: 'Backfill App',
      topicDiscoveryRequestedAt: requestedAt,
    })
  await database
    .insert(storeConnections)
    .values({ id: connectionId, organizationId, appId, provider: 'apple_app_store' })
  await database
    .insert(reviews)
    .values({
      id: reviewId,
      organizationId,
      appId,
      storeConnectionId: connectionId,
      externalReviewId: reviewId,
      rating: 1,
      body: '',
      reviewedAt: new Date(),
      analysisStatus,
    })
  return { appId, reviewId, requestedAt }
}

describe.skipIf(databaseUrl === undefined)('discovery during classification backfill', () => {
  it.each(['pending', 'processing'] as const)(
    'preserves a manual request while a Review is %s, then completes after classification',
    async (status) => {
      const { appId, reviewId, requestedAt } = await createBackfill(status)
      const proposeTopics = vi.fn<TopicDiscoveryProvider['proposeTopics']>()
      const runtime = { database, topicDiscoveryProvider: { proposeTopics } }
      const payload = { organizationId, appId, trigger: 'manual' as const }

      await discoverTopicsForApp(runtime, payload)
      expect(await database.query.apps.findFirst({ where: eq(apps.id, appId) })).toMatchObject({
        lastTopicDiscoveryAt: null,
        topicDiscoveryRequestedAt: requestedAt,
      })
      expect(proposeTopics).not.toHaveBeenCalled()

      await database
        .update(reviews)
        .set({ analysisStatus: 'skipped' })
        .where(eq(reviews.id, reviewId))
      await discoverTopicsForApp(runtime, payload)
      const completed = await database.query.apps.findFirst({ where: eq(apps.id, appId) })
      expect(completed?.lastTopicDiscoveryAt).toBeInstanceOf(Date)
      expect(completed?.topicDiscoveryRequestedAt).toBeNull()
      expect(proposeTopics).not.toHaveBeenCalled()
    },
  )
})
