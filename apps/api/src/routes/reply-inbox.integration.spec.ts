import { randomUUID } from 'node:crypto'

import { listReplyInboxResponseSchema } from '@reviewinbox/contracts'
import {
  apps,
  closeDatabase,
  createDatabase,
  organization,
  reviews,
  storeConnections,
} from '@reviewinbox/db'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createReplyInboxReadHandler } from './reply-inbox'

const databaseUrl = process.env['ANALYSIS_TEST_DATABASE_URL']
const database = createDatabase(databaseUrl ?? 'postgres://unused-inbox-test')
const scope = { organizationId: '' }
const replyInboxRoutes = new Hono().get(
  '/api/reply-inbox',
  createReplyInboxReadHandler({
    database,
    requireSession: () =>
      Promise.resolve({
        ok: true,
        session: { organizationId: scope.organizationId, userId: 'test', role: 'owner' },
      }),
  }),
)
const organizationId = `inbox-link-${randomUUID()}`
const appId = randomUUID()
const connectionId = randomUUID()
const targets = (['pending', 'ignored', 'published'] as const).map((status) => ({
  id: randomUUID(),
  status,
}))

beforeAll(async () => {
  if (databaseUrl === undefined) {
    return
  }
  scope.organizationId = organizationId
  await database
    .insert(organization)
    .values({ id: organizationId, name: 'Inbox link', slug: organizationId, createdAt: new Date() })
  await database.insert(apps).values({ id: appId, organizationId, name: 'App' })
  await database
    .insert(storeConnections)
    .values({ id: connectionId, appId, organizationId, provider: 'apple_app_store' })
  await database
    .insert(reviews)
    .values([
      ...Array.from({ length: 101 }, () => reviewValues(randomUUID(), 'pending', new Date())),
      ...targets.map((target) => reviewValues(target.id, target.status, new Date('2020-01-01'))),
    ])
})

afterAll(async () => {
  if (databaseUrl === undefined) {
    return
  }
  await database.delete(organization).where(eq(organization.id, organizationId))
  await closeDatabase(database)
})

describe.skipIf(databaseUrl === undefined)('Reply Inbox direct Review links', () => {
  it('loads a target outside the first page and regardless of reply status', async () => {
    const list = listReplyInboxResponseSchema.parse(
      await (await replyInboxRoutes.request('/api/reply-inbox')).json(),
    )
    expect(list.reviews).toHaveLength(100)
    expect(list.reviews.some((review) => targets.some((target) => target.id === review.id))).toBe(
      false,
    )
    await Promise.all(
      targets.map(async (target) => {
        const response = await replyInboxRoutes.request(`/api/reply-inbox?reviewId=${target.id}`)
        expect(response.status).toBe(200)
        const result = listReplyInboxResponseSchema.parse(await response.json())
        expect(result.reviews.map((review) => review.id)).toEqual([target.id])
        expect(result.reviews[0]?.replyStatus).toBe(target.status)
      }),
    )
  })

  it('rejects malformed and missing IDs without falling back to the inbox', async () => {
    expect((await replyInboxRoutes.request('/api/reply-inbox?reviewId=invalid')).status).toBe(400)
    expect(
      (await replyInboxRoutes.request(`/api/reply-inbox?reviewId=${randomUUID()}`)).status,
    ).toBe(404)
  })

  it('does not expose a Review from another active Organization', async () => {
    scope.organizationId = `foreign-${randomUUID()}`
    try {
      expect(
        (await replyInboxRoutes.request(`/api/reply-inbox?reviewId=${targets[0]?.id}`)).status,
      ).toBe(404)
    } finally {
      scope.organizationId = organizationId
    }
  })
})

function reviewValues(
  id: string,
  replyStatus: 'pending' | 'ignored' | 'published',
  reviewedAt: Date,
) {
  return {
    id,
    organizationId,
    appId,
    storeConnectionId: connectionId,
    externalReviewId: id,
    title: 'A Review',
    body: 'Review text',
    rating: 3,
    replyStatus,
    reviewedAt,
  }
}
