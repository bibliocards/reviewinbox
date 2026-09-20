import { generateKeyPairSync } from 'node:crypto'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { appleAppStoreReviewAdapter } from './adapter'
import { syncAppleAppStoreReviews } from './client'

describe('publishing Apple App Store replies', () => {
  afterEach(() => vi.restoreAllMocks())

  it('replaces a previous reply through the review response create-or-update endpoint', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ data: { id: 'response-123' } }))
      .mockResolvedValueOnce(Response.json({ data: { id: 'response-123' } }))
    const request = {
      externalAppId: '123456789',
      externalReviewId: 'review-123',
      credential: {
        issuerId: '00000000-0000-0000-0000-000000000000',
        keyId: 'ABC123DEFG',
        privateKey: createTestPrivateKey(),
      },
    }

    await appleAppStoreReviewAdapter.publishReply({
      ...request,
      replyText: 'Thanks for reviewing.',
    })
    const updated = await appleAppStoreReviewAdapter.publishReply({
      ...request,
      replyText: 'The crash mentioned in your updated review is fixed in 2.0.',
    })

    expect(updated.externalReplyId).toBe('response-123')
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://api.appstoreconnect.apple.com/v1/customerReviewResponses',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          data: {
            type: 'customerReviewResponses',
            attributes: {
              responseBody: 'The crash mentioned in your updated review is fixed in 2.0.',
            },
            relationships: { review: { data: { type: 'customerReviews', id: 'review-123' } } },
          },
        }),
      }),
    )
  })
})

describe('syncAppleAppStoreReviews', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('requests customer reviews from the official App Store Connect API host', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )

    await syncAppleAppStoreReviews({
      appStoreAppId: '123456789',
      credential: {
        issuerId: '00000000-0000-0000-0000-000000000000',
        keyId: 'ABC123DEFG',
        privateKey: createTestPrivateKey(),
      },
      checkpoint: null,
      maxPages: 1,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.appstoreconnect.apple.com/v1/apps/123456789/customerReviews?include=response&sort=-createdDate&limit=200',
      expect.any(Object),
    )
  })

  it('stops pagination when App Store Connect returns an empty next link', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ data: [], links: { next: '' } }))

    await syncAppleAppStoreReviews({
      appStoreAppId: '123456789',
      credential: {
        issuerId: '00000000-0000-0000-0000-000000000000',
        keyId: 'ABC123DEFG',
        privateKey: createTestPrivateKey(),
      },
      checkpoint: null,
      maxPages: 3,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

function createTestPrivateKey() {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  return privateKey.export({ format: 'pem', type: 'pkcs8' })
}
