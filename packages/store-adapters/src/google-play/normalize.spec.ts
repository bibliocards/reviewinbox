import { describe, expect, it } from 'vitest'

import { normalizeGooglePlayReview } from './normalize'

describe('normalizeGooglePlayReview', () => {
  it('maps the Google Play app version name', () => {
    const review = normalizeGooglePlayReview({
      reviewId: 'review-1',
      comments: [
        {
          userComment: {
            appVersionName: '1.2.3',
            lastModified: { seconds: 1 },
            starRating: 5,
            text: 'Great app',
          },
        },
      ],
    })

    expect(review?.version).toBe('1.2.3')
  })

  it('falls back to the Google Play app version code', () => {
    const review = normalizeGooglePlayReview({
      reviewId: 'review-1',
      comments: [
        {
          userComment: {
            appVersionCode: 42,
            lastModified: { seconds: 1 },
            starRating: 5,
            text: 'Great app',
          },
        },
      ],
    })

    expect(review?.version).toBe('42')
  })
})
