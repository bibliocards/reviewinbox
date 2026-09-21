import { generateKeyPairSync, randomUUID } from 'node:crypto'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { syncAppleAppStoreReviews } from './client'
import {
  createAppleVersionLookupCursor,
  readAppleVersionLookupPage,
  appleVersionLookupCursorSchema,
} from './version-lookup'

const credential = () => ({
  issuerId: randomUUID(),
  keyId: 'TEST',
  privateKey: generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({
    format: 'pem',
    type: 'pkcs8',
  }),
})
afterEach(() => vi.restoreAllMocks())

describe('Apple version lookup', () => {
  it('returns all associations from a version page with their review content', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        Response.json({ data: [{ id: 'v1', attributes: { versionString: '2.1.3' } }] }),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: [
            { id: 'r1', attributes: { title: 'Good', body: 'Works', rating: 5 } },
            { id: 'r2', attributes: { body: 'Crash', rating: 1 } },
          ],
        }),
      )
    const key = credential()
    const versions = await readAppleVersionLookupPage({
      credential: key,
      cursor: createAppleVersionLookupCursor('app1'),
    })
    expect(versions.matches).toEqual([])
    expect(versions.cursor).not.toBeNull()
    const page = await readAppleVersionLookupPage({
      credential: key,
      cursor: appleVersionLookupCursorSchema.parse(versions.cursor),
    })
    expect(page.matches).toEqual([
      { externalReviewId: 'r1', version: '2.1.3', title: 'Good', body: 'Works', rating: 5 },
      { externalReviewId: 'r2', version: '2.1.3', title: null, body: 'Crash', rating: 1 },
    ])
    expect(page.cursor).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})

it('follows review and version pagination without losing its current version', async () => {
  const key = credential()
  vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(
      Response.json({
        data: [{ id: 'v1', attributes: { versionString: '1' } }],
        links: {
          next: 'https://api.appstoreconnect.apple.com/v1/apps/a/appStoreVersions?cursor=next',
        },
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        data: [{ id: 'r1', attributes: { body: 'first', rating: 1 } }],
        links: {
          next: 'https://api.appstoreconnect.apple.com/v1/appStoreVersions/v1/customerReviews?cursor=next',
        },
      }),
    )
    .mockResolvedValueOnce(
      Response.json({ data: [{ id: 'r2', attributes: { body: 'second', rating: 2 } }] }),
    )
    .mockResolvedValueOnce(
      Response.json({ data: [{ id: 'v2', attributes: { versionString: '2' } }] }),
    )
    .mockResolvedValueOnce(
      Response.json({ data: [{ id: 'r3', attributes: { body: 'third', rating: 3 } }] }),
    )
  let cursor: ReturnType<typeof createAppleVersionLookupCursor> | null =
    createAppleVersionLookupCursor('a')
  const matches = []
  while (cursor !== null) {
    // oxlint-disable-next-line no-await-in-loop -- Exercise dependent cursor pages in server order.
    const page = await readAppleVersionLookupPage({ credential: key, cursor })
    matches.push(...page.matches)
    cursor = page.cursor
  }
  expect(matches.map(({ externalReviewId, version }) => [externalReviewId, version])).toEqual([
    ['r1', '1'],
    ['r2', '1'],
    ['r3', '2'],
  ])
})

it('reserves quota for ingestion and shares the pause across apps using the same key', async () => {
  const key = credential()
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(
      Response.json(
        { data: [] },
        { headers: { 'X-Rate-Limit': 'user-hour-lim:100;user-hour-rem:5;' } },
      ),
    )
  await readAppleVersionLookupPage({ credential: key, cursor: createAppleVersionLookupCursor('a') })
  await expect(
    readAppleVersionLookupPage({ credential: key, cursor: createAppleVersionLookupCursor('b') }),
  ).rejects.toMatchObject({ code: 'apple_rate_limited' })
  expect(fetch).toHaveBeenCalledTimes(1)
})

it('does not follow pagination to another host with the Store Credential', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch')
  await expect(
    readAppleVersionLookupPage({
      credential: credential(),
      cursor: { versionsUrl: 'https://attacker.example', versions: [], reviewsUrl: null },
    }),
  ).rejects.toMatchObject({ code: 'apple_invalid_response' })
  expect(fetch).not.toHaveBeenCalled()
})

it('defers version searches across apps while ingestion using the same key is active', async () => {
  const key = credential()
  let release!: (response: Response) => void
  const response = new Promise<Response>((resolve) => {
    release = resolve
  })
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(Response.json({ data: [] }))
    .mockReturnValueOnce(response)
  const ingestion = syncAppleAppStoreReviews({
    appStoreAppId: 'a',
    credential: key,
    checkpoint: null,
  })
  await expect(
    readAppleVersionLookupPage({ credential: key, cursor: createAppleVersionLookupCursor('b') }),
  ).rejects.toMatchObject({ code: 'apple_rate_limited' })
  expect(fetch).toHaveBeenCalledTimes(1)
  release(Response.json({ data: [] }))
  await ingestion
  fetch.mockResolvedValueOnce(Response.json({ data: [] }))
  await readAppleVersionLookupPage({ credential: key, cursor: createAppleVersionLookupCursor('b') })
  expect(fetch).toHaveBeenCalledTimes(2)
})
