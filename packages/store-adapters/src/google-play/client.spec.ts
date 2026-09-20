import { generateKeyPairSync } from 'node:crypto'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { googlePlayReviewAdapter } from './adapter'
import { syncGooglePlayReviews } from './client'

describe('publishing Google Play replies', () => {
  afterEach(() => vi.restoreAllMocks())

  it('replaces a previous reply through the review reply endpoint', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ access_token: 'test-access-token' }))
      .mockResolvedValueOnce(Response.json({ result: { replyText: 'Thanks for reviewing.' } }))
      .mockResolvedValueOnce(Response.json({ access_token: 'test-access-token' }))
      .mockResolvedValueOnce(
        Response.json({
          result: {
            replyText: 'The crash mentioned in your updated review is fixed in 2.0.',
            lastEdited: { seconds: '1700000000', nanos: 0 },
          },
        }),
      )
    const request = {
      externalAppId: 'com.example',
      externalReviewId: 'review-123',
      credential: {
        client_email: 'reviewinbox@example.iam.gserviceaccount.com',
        private_key: createTestPrivateKey(),
      },
    }

    await googlePlayReviewAdapter.publishReply({ ...request, replyText: 'Thanks for reviewing.' })
    const updated = await googlePlayReviewAdapter.publishReply({
      ...request,
      replyText: 'The crash mentioned in your updated review is fixed in 2.0.',
    })

    expect(updated.publishedAt).toBe('2023-11-14T22:13:20.000Z')
    expect(fetchMock).toHaveBeenLastCalledWith(
      new URL(
        'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.example/reviews/review-123:reply',
      ),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          replyText: 'The crash mentioned in your updated review is fixed in 2.0.',
        }),
      }),
    )
  })
})

describe('syncGooglePlayReviews', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reuses one OAuth access token across paginated review requests', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ access_token: 'test-access-token' }))
      .mockResolvedValueOnce(
        Response.json({
          reviews: [createReview('first')],
          tokenPagination: { nextPageToken: 'second-page' },
        }),
      )
      .mockResolvedValueOnce(Response.json({ reviews: [createReview('second')] }))

    await syncGooglePlayReviews({
      packageName: 'com.example',
      credential: {
        client_email: 'reviewinbox@example.iam.gserviceaccount.com',
        private_key: createTestPrivateKey(),
      },
      checkpoint: null,
      maxPages: 2,
      pageLimit: 1,
    })

    const requestedUrls = fetchMock.mock.calls.map(([input]) => readRequestUrl(input))
    expect(
      requestedUrls.filter((url) => url === 'https://oauth2.googleapis.com/token'),
    ).toHaveLength(1)
    expect(
      requestedUrls.filter((url) =>
        url.startsWith(
          'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.example/reviews',
        ),
      ),
    ).toHaveLength(2)
  })

  it('stops pagination when Google Play returns an empty next page token', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ access_token: 'test-access-token' }))
      .mockResolvedValueOnce(Response.json({ reviews: [], tokenPagination: { nextPageToken: '' } }))

    await syncGooglePlayReviews({
      packageName: 'com.example',
      credential: {
        client_email: 'reviewinbox@example.iam.gserviceaccount.com',
        private_key: createTestPrivateKey(),
      },
      checkpoint: null,
      maxPages: 3,
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

function createReview(id: string) {
  return {
    reviewId: `review-${id}`,
    comments: [
      {
        userComment: {
          text: 'Works well.',
          starRating: 5,
          lastModified: { seconds: '1700000000', nanos: 0 },
        },
      },
    ],
  }
}

function readRequestUrl(input: RequestInfo | URL): string {
  if (input instanceof URL) {
    return input.toString()
  }
  if (input instanceof Request) {
    return input.url
  }
  return input
}

function createTestPrivateKey() {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  return privateKey.export({ format: 'pem', type: 'pkcs8' })
}
