import { describe, expect, it } from 'vitest'

import { createReviewContentToken, isReviewContentTokenCurrent } from './review-content'

const currentReview = { title: 'Current title', body: 'Current body', rating: 4 }

describe('review content token', () => {
  it('accepts unchanged content even when unrelated metadata changes', () => {
    const token = createReviewContentToken(currentReview)

    expect(isReviewContentTokenCurrent(token, { ...currentReview, version: '2.0' })).toBe(true)
  })

  it.each([
    ['title', { ...currentReview, title: 'Previous title' }],
    ['body', { ...currentReview, body: 'Previous body' }],
    ['rating', { ...currentReview, rating: 3 }],
  ])('rejects a token when the %s changes', (_field, changedReview) => {
    const token = createReviewContentToken(currentReview)

    expect(isReviewContentTokenCurrent(token, changedReview)).toBe(false)
  })
})
