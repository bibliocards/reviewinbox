import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto'

import { encryptStoreCredential } from '@reviewinbox/core'
import {
  apps,
  closeDatabase,
  createDatabase,
  organization,
  reviews,
  storeConnections,
  storeCredentials,
  usageEvents,
} from '@reviewinbox/db'
import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'

import { enrichAppleReviewVersions } from './apple-version-lookup'

const url = process.env['ANALYSIS_TEST_DATABASE_URL']
const database = createDatabase(url ?? 'postgres://unused')
const orgId = `apple-versions-${randomUUID()}`
const encryptionKey = randomBytes(32)
beforeAll(async () => {
  if (url === undefined) {
    return
  }
  vi.stubEnv('APP_ENCRYPTION_KEY', encryptionKey.toString('base64'))
  await database
    .insert(organization)
    .values({ id: orgId, name: 'Apple versions test', slug: orgId, createdAt: new Date() })
})
afterEach(() => vi.restoreAllMocks())
afterAll(async () => {
  if (url === undefined) {
    return
  }
  await database.delete(organization).where(eq(organization.id, orgId))
  await closeDatabase(database)
  vi.unstubAllEnvs()
})

async function fixture() {
  const appId = randomUUID(),
    connectionId = randomUUID()
  await database.insert(apps).values({ id: appId, organizationId: orgId, name: 'Test' })
  await database
    .insert(storeConnections)
    .values({
      id: connectionId,
      appId,
      organizationId: orgId,
      provider: 'apple_app_store',
      externalAppId: '123',
    })
  const privateKey = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({
    format: 'pem',
    type: 'pkcs8',
  })
  await database
    .insert(storeCredentials)
    .values({
      storeConnectionId: connectionId,
      ...encryptStoreCredential(
        JSON.stringify({ issuerId: randomUUID(), keyId: 'TEST', privateKey }),
        encryptionKey,
      ),
    })
  await database
    .insert(reviews)
    .values(
      ['r1', 'r2'].map((externalReviewId) => ({
        appId,
        organizationId: orgId,
        storeConnectionId: connectionId,
        externalReviewId,
        body: 'Works',
        rating: 5,
        reviewedAt: new Date(),
        replyStatus: 'ignored' as const,
      })),
    )
  return { database, organizationId: orgId, storeConnectionId: connectionId }
}

const versionPage = () =>
  Response.json({
    data: [
      { id: 'v1', attributes: { versionString: '2.1.3' } },
      { id: 'unused', attributes: { versionString: '1.0' } },
    ],
  })
const reviewPage = () =>
  Response.json({
    data: [
      { id: 'r1', attributes: { body: 'Works', rating: 5 } },
      { id: 'r2', attributes: { body: 'Works', rating: 5 } },
    ],
  })

it.skipIf(url === undefined)(
  'groups Reviews, stores exact versions, and performs no calls once resolved',
  async () => {
    const input = await fixture()
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(versionPage())
      .mockResolvedValueOnce(reviewPage())
    await enrichAppleReviewVersions(input)
    const result = await database
      .select()
      .from(reviews)
      .where(eq(reviews.storeConnectionId, input.storeConnectionId))
    expect(
      result.map((r) => ({
        version: r.version,
        status: r.versionLookupStatus,
        reply: r.replyStatus,
      })),
    ).toEqual([
      { version: '2.1.3', status: 'resolved', reply: 'ignored' },
      { version: '2.1.3', status: 'resolved', reply: 'ignored' },
    ])
    await enrichAppleReviewVersions(input)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(
      await database.select().from(usageEvents).where(eq(usageEvents.organizationId, orgId)),
    ).toEqual([])
  },
)
it.skipIf(url === undefined)(
  'keeps quota failures pending and resumes at the failed page',
  async () => {
    const input = await fixture()
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(versionPage())
      .mockResolvedValueOnce(Response.json({}, { status: 429, headers: { 'Retry-After': '1' } }))
    await expect(enrichAppleReviewVersions(input)).rejects.toMatchObject({
      code: 'apple_rate_limited',
    })
    expect(
      await database
        .select({ status: reviews.versionLookupStatus })
        .from(reviews)
        .where(eq(reviews.storeConnectionId, input.storeConnectionId)),
    ).toEqual([{ status: 'pending' }, { status: 'pending' }])
    await enrichAppleReviewVersions(input)
    expect(fetch).toHaveBeenCalledTimes(2)
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now + 2000)
    fetch.mockResolvedValueOnce(reviewPage())
    await enrichAppleReviewVersions(input)
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(fetch.mock.calls[2]?.[0]).toEqual(
      expect.stringContaining('/appStoreVersions/v1/customerReviews'),
    )
  },
)

it.skipIf(url === undefined)(
  'marks unavailable only after exhausting all versions and keeps tenant isolation',
  async () => {
    const input = await fixture()
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ data: [] }))
    await enrichAppleReviewVersions({ ...input, organizationId: 'another-organization' })
    expect(fetch).not.toHaveBeenCalled()
    await enrichAppleReviewVersions(input)
    expect(
      await database
        .select({ status: reviews.versionLookupStatus })
        .from(reviews)
        .where(eq(reviews.storeConnectionId, input.storeConnectionId)),
    ).toEqual([{ status: 'unavailable' }, { status: 'unavailable' }])
  },
)

it.skipIf(url === undefined)(
  'does not assign an old version to a Review edited during lookup',
  async () => {
    const input = await fixture()
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(versionPage())
      .mockImplementationOnce(async () => {
        await database
          .update(reviews)
          .set({ body: 'Edited concurrently', versionLookupScanId: null })
          .where(
            and(
              eq(reviews.storeConnectionId, input.storeConnectionId),
              eq(reviews.externalReviewId, 'r1'),
            ),
          )
        return reviewPage()
      })
    await enrichAppleReviewVersions(input)
    expect(fetch).toHaveBeenCalledTimes(2)
    const result = await database.query.reviews.findFirst({
      where: and(
        eq(reviews.storeConnectionId, input.storeConnectionId),
        eq(reviews.externalReviewId, 'r1'),
      ),
    })
    expect(result).toMatchObject({
      body: 'Edited concurrently',
      version: null,
      versionLookupStatus: 'pending',
    })
  },
)

it.skipIf(url === undefined)('does not overlap lookups for the same connection', async () => {
  const input = await fixture()
  let release!: (response: Response) => void
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve
        }),
    )
    .mockResolvedValueOnce(reviewPage())
  const first = enrichAppleReviewVersions(input)
  await vi.waitFor(() => {
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  await enrichAppleReviewVersions(input)
  expect(fetch).toHaveBeenCalledTimes(1)
  release(versionPage())
  await first
  expect(fetch).toHaveBeenCalledTimes(2)
})
