import { randomUUID } from 'node:crypto'

import { AiDraftingError } from '@reviewinbox/ai'
import { listReplyInboxResponseSchema } from '@reviewinbox/contracts'
import {
  apps,
  closeDatabase,
  createDatabase,
  organization,
  replyDrafts,
  reviews,
  storeConnections,
  usageEvents,
} from '@reviewinbox/db'
import type { DraftGenerator } from '@reviewinbox/reply-drafts'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { createReviewContentToken } from '../review-content'
import { createRegenerateReplyDraftHandler } from './reply-draft-regeneration'
import { createReplyInboxReadHandler } from './reply-inbox'

const databaseUrl = process.env['ANALYSIS_TEST_DATABASE_URL']
const database = createDatabase(databaseUrl ?? 'postgres://unused-regeneration-test')
const organizationId = `regeneration-${randomUUID()}`
const appId = randomUUID()
const connectionId = randomUUID()
const reviewId = randomUUID()
const content = { title: 'Useful app', body: 'Please fix the export.', rating: 3 }
const generatedDraft = {
  draftText: 'Export is fixed in version 2.4. Thanks!',
  detectedReviewLanguage: 'en',
  chosenReplyLanguage: 'en',
  model: 'test',
  promptVersion: 'test',
}
const generateDraft = vi.fn<DraftGenerator>().mockResolvedValue(generatedDraft)
const requireSession = () =>
  Promise.resolve({ ok: true as const, session: { organizationId, userId: 'test', role: 'owner' } })
const routes = new Hono()
  .get('/api/reply-inbox', createReplyInboxReadHandler({ database, requireSession }))
  .post(
    '/api/reply-inbox/:reviewId/draft/regenerate',
    createRegenerateReplyDraftHandler({
      database,
      requireSession,
      getRuntime: () => ({ deploymentMode: 'cloud', aiProvider: 'managed', generateDraft }),
    }),
  )

beforeAll(async () => {
  if (databaseUrl === undefined) {
    return
  }
  await database
    .insert(organization)
    .values({
      id: organizationId,
      name: 'Regeneration',
      slug: organizationId,
      createdAt: new Date(),
    })
  await database
    .insert(apps)
    .values({ id: appId, organizationId, name: 'App', autoDraftEnabled: false })
  await database
    .insert(storeConnections)
    .values({ id: connectionId, appId, organizationId, provider: 'apple_app_store' })
  await database
    .insert(reviews)
    .values({
      id: reviewId,
      organizationId,
      appId,
      storeConnectionId: connectionId,
      externalReviewId: reviewId,
      ...content,
      replyStatus: 'drafted',
      reviewedAt: new Date(),
    })
  await database
    .insert(replyDrafts)
    .values({
      organizationId,
      appId,
      reviewId,
      draftText: 'Original saved draft.',
      chosenReplyLanguage: 'en',
      model: 'test',
      promptVersion: 'test',
    })
})

afterAll(async () => {
  if (databaseUrl === undefined) {
    return
  }
  await database.delete(organization).where(eq(organization.id, organizationId))
  await closeDatabase(database)
})

beforeEach(async () => {
  if (databaseUrl === undefined) {
    return
  }
  generateDraft.mockReset().mockResolvedValue(generatedDraft)
  await database.delete(usageEvents).where(eq(usageEvents.organizationId, organizationId))
  await database
    .update(organization)
    .set({ billingOverrides: { monthlyManagedAiReplyDraftCap: 5 } })
    .where(eq(organization.id, organizationId))
  await database
    .update(reviews)
    .set({ ...content, replyStatus: 'drafted' })
    .where(eq(reviews.id, reviewId))
})

describe.skipIf(databaseUrl === undefined)('Reply Draft regeneration', () => {
  it('previews an unsaved rewrite without saving it or changing the Review', async () => {
    const before = await readReview()
    const response = await routes.request(`/api/reply-inbox/${reviewId}/draft/regenerate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        draftText: 'My unsaved correction: fixed in version 2.4.',
        adjustments: ['shorter'],
        instructions: 'Do not suggest contacting support.',
        reviewContentToken: createReviewContentToken(content),
      }),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ draftText: 'Export is fixed in version 2.4. Thanks!' })
    expect(await readReview()).toEqual(before)
  })

  it('rejects access from another Organization before calling the model', async () => {
    const foreignRoutes = new Hono().post(
      '/api/reply-inbox/:reviewId/draft/regenerate',
      createRegenerateReplyDraftHandler({
        database,
        requireSession: () =>
          Promise.resolve({
            ok: true,
            session: { organizationId: 'another-organization', userId: 'test', role: 'owner' },
          }),
        getRuntime: () => ({ deploymentMode: 'cloud', aiProvider: 'managed', generateDraft }),
      }),
    )
    const response = await postDraft(foreignRoutes)
    expect(response.status).toBe(404)
    expect(generateDraft).not.toHaveBeenCalled()
  })

  it('rejects unknown preferences and excessive instructions before calling the model', async () => {
    expect((await postDraft(routes, { adjustments: ['publish_now'] })).status).toBe(400)
    expect((await postDraft(routes, { instructions: 'x'.repeat(1501) })).status).toBe(400)
    expect(generateDraft).not.toHaveBeenCalled()
  })

  it('rejects stale Review content before generating a proposal', async () => {
    await database
      .update(reviews)
      .set({ body: 'The export still fails.' })
      .where(eq(reviews.id, reviewId))
    const response = await postDraft()
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ errorCode: 'review_changed' })
    expect(generateDraft).not.toHaveBeenCalled()
  })
})

describe.skipIf(databaseUrl === undefined)(
  'Reply Draft regeneration quota and late results',
  () => {
    it('preserves the draft when the provider fails and charges only successful proposals', async () => {
      await database
        .update(organization)
        .set({ billingOverrides: { monthlyManagedAiReplyDraftCap: 1 } })
        .where(eq(organization.id, organizationId))
      const before = await readReview()
      generateDraft.mockRejectedValueOnce(
        new AiDraftingError('provider_unavailable', 'Unavailable'),
      )
      expect((await postDraft()).status).toBe(503)
      expect(await readReview()).toEqual(before)
      expect((await postDraft()).status).toBe(200)
      const capped = await postDraft()
      expect(capped.status).toBe(429)
      expect(await capped.json()).toMatchObject({
        errorCode: 'monthly_managed_ai_reply_draft_cap_reached',
      })
      expect(await readReview()).toEqual(before)
    })

    it('serializes concurrent proposals at the last available quota unit', async () => {
      await database
        .update(organization)
        .set({ billingOverrides: { monthlyManagedAiReplyDraftCap: 1 } })
        .where(eq(organization.id, organizationId))
      const responses = await Promise.all([postDraft(), postDraft()])
      expect(new Set(responses.map((response) => response.status))).toEqual(new Set([200, 429]))
      expect(generateDraft).toHaveBeenCalledOnce()
    })

    it('discards a late proposal after the Review changes without overwriting the saved draft', async () => {
      generateDraft.mockImplementationOnce(async () => {
        await database
          .update(reviews)
          .set({ body: 'The export still fails.' })
          .where(eq(reviews.id, reviewId))
        return generatedDraft
      })
      const response = await postDraft()
      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({ errorCode: 'review_changed' })
      expect((await readReview())?.replyDraft?.draftText).toBe('Original saved draft.')
    })
  },
)

function postDraft(
  targetRoutes = routes,
  overrides: { adjustments?: string[]; instructions?: string } = {},
) {
  return targetRoutes.request(`/api/reply-inbox/${reviewId}/draft/regenerate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      draftText: 'My unsaved correction: fixed in version 2.4.',
      adjustments: [],
      instructions: '',
      reviewContentToken: createReviewContentToken(content),
      ...overrides,
    }),
  })
}

async function readReview() {
  const response = await routes.request(`/api/reply-inbox?reviewId=${reviewId}`)
  return listReplyInboxResponseSchema.parse(await response.json()).reviews[0]
}
