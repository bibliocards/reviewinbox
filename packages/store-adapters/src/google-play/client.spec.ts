import { generateKeyPairSync } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { syncGooglePlayReviews } from './client'

describe('syncGooglePlayReviews', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reuses one OAuth access token across paginated review requests', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)

      if (url === 'https://oauth2.googleapis.com/token') {
        return Response.json({ access_token: 'test-access-token' })
      }

      if (url.startsWith('https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.example/reviews')) {
        const parsedUrl = new URL(url)
        const pageToken = parsedUrl.searchParams.get('token')

        return Response.json({
          reviews: [
            {
              reviewId: `review-${pageToken ?? 'first'}`,
              comments: [
                {
                  userComment: {
                    text: 'Works well.',
                    starRating: 5,
                    lastModified: { seconds: '1700000000', nanos: 0 },
                  },
                },
              ],
            },
          ],
          ...(pageToken ? {} : { tokenPagination: { nextPageToken: 'second-page' } }),
        })
      }

      return new Response(null, { status: 404 })
    })

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

    const requestedUrls = fetchMock.mock.calls.map(([input]) => String(input))
    expect(requestedUrls.filter((url) => url === 'https://oauth2.googleapis.com/token')).toHaveLength(1)
    expect(
      requestedUrls.filter((url) =>
        url.startsWith('https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.example/reviews'),
      ),
    ).toHaveLength(2)
  })
})

function createTestPrivateKey() {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  return privateKey.export({ format: 'pem', type: 'pkcs8' }).toString()
}
