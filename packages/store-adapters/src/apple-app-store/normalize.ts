import { readRating, readString } from '../common'
import type { NormalizedStoreReview } from '../index'
import type { AppleCustomerReviewResource } from './types'

export function normalizeAppleReview(resource: AppleCustomerReviewResource): NormalizedStoreReview {
  const attributes = resource.attributes ?? {}
  const reviewedAt = readString(attributes['createdDate']) ?? new Date().toISOString()

  return {
    externalReviewId: resource.id,
    authorDisplayName: readString(attributes['reviewerNickname']),
    rating: readRating(attributes['rating']),
    title: readString(attributes['title']),
    body: readString(attributes['body']) ?? '',
    language: null,
    version: readString(attributes['appVersionString']),
    country: readString(attributes['territory']),
    locale: null,
    reviewedAt,
    rawPayload: resource,
  }
}
