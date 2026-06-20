import { describe, expect, it } from 'vitest'

import { normalizeAppleReview } from './normalize'

describe('normalizeAppleReview', () => {
  it('maps the App Store review app version string', () => {
    const review = normalizeAppleReview({
      id: 'review-1',
      attributes: {
        appVersionString: '1.2.3',
        body: 'Great app',
        createdDate: '2026-06-20T10:00:00Z',
        rating: 5,
      },
    })

    expect(review.version).toBe('1.2.3')
  })

  it('falls back to the App Store review app version attribute', () => {
    const review = normalizeAppleReview({
      id: 'review-1',
      attributes: {
        appVersion: '1.2.3',
        body: 'Great app',
        createdDate: '2026-06-20T10:00:00Z',
        rating: 5,
      },
    })

    expect(review.version).toBe('1.2.3')
  })
})
