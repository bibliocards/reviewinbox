import { describe, expect, it } from 'vitest'

import { normalizeAppleReview } from './normalize'

describe('normalizeAppleReview', () => {
  it('leaves the version for the version-scoped API lookup rather than undocumented attributes', () => {
    expect(
      normalizeAppleReview({
        id: 'review-1',
        attributes: {
          appVersionString: '1.2.3',
          appVersion: '1.2.3',
          body: 'Works',
          rating: 5,
          createdDate: '2026-06-20T10:00:00Z',
        },
      }).version,
    ).toBeNull()
  })
})
