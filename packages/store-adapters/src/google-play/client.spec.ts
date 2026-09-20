import { generateKeyPairSync } from 'node:crypto'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { syncGooglePlayReviews } from './client'

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
