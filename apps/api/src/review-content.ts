import { createHash } from 'node:crypto'

export type ReviewContent = { title: string | null; body: string; rating: number }

export function createReviewContentToken(review: ReviewContent): string {
  return createHash('sha256')
    .update(JSON.stringify({ title: review.title, body: review.body, rating: review.rating }))
    .digest('hex')
}

export function isReviewContentTokenCurrent(token: string, review: ReviewContent): boolean {
  return token === createReviewContentToken(review)
}
