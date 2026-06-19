import { readRating, readString } from '../common'
import type { NormalizedStoreReview } from '../index'
import type { GooglePlayReviewResource, GoogleTimestamp } from './types'

export function normalizeGooglePlayReview(resource: GooglePlayReviewResource): NormalizedStoreReview | null {
  if (!resource.reviewId) {
    return null
  }

  const userComment = resource.comments?.find((comment) => comment.userComment)?.userComment
  if (!userComment) {
    return null
  }

  return {
    externalReviewId: resource.reviewId,
    authorDisplayName: readString(resource.authorName),
    rating: readRating(userComment.starRating),
    title: null,
    body: readString(userComment.text) ?? '',
    language: readString(userComment.reviewerLanguage),
    version: readString(userComment.appVersionName),
    country: null,
    locale: readString(userComment.reviewerLanguage),
    reviewedAt: readGoogleTimestamp(userComment.lastModified),
    rawPayload: resource,
  }
}

function readGoogleTimestamp(value: GoogleTimestamp | undefined) {
  const seconds = Number(value?.seconds ?? 0)
  const nanos = Number(value?.nanos ?? 0)
  return new Date(seconds * 1000 + Math.floor(nanos / 1_000_000)).toISOString()
}
