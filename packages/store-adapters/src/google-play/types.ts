import type { ReviewSyncCheckpoint, StoreCredentialVerificationResult } from '../index'

export type GooglePlayServiceAccountCredential = {
  client_email: string
  private_key: string
}

export type GooglePlayReviewSyncRequest = {
  packageName: string
  credential: GooglePlayServiceAccountCredential
  checkpoint: ReviewSyncCheckpoint | null
  maxPages?: number
  pageLimit?: number
  timeoutMs?: number
}

export type GooglePlayReplyPublishRequest = {
  packageName: string
  externalReviewId: string
  replyText: string
  credential: GooglePlayServiceAccountCredential
  timeoutMs?: number
}

export type GooglePlayStoreAdapterErrorCode =
  | 'google_auth_failed'
  | 'google_forbidden'
  | 'google_not_found'
  | 'google_rate_limited'
  | 'google_unavailable'
  | 'google_invalid_response'

export type GooglePlayCredentialVerificationResult = StoreCredentialVerificationResult<GooglePlayStoreAdapterErrorCode>

export type GooglePlayReviewsResponse = {
  reviews?: GooglePlayReviewResource[]
  tokenPagination?: {
    nextPageToken?: string
  }
}

export type GooglePlayReplyPublishResponse = {
  result?: {
    replyText?: string
    lastEdited?: GoogleTimestamp
  }
}

export type GooglePlayReviewResource = {
  reviewId?: string
  authorName?: string
  comments?: Array<{
    userComment?: {
      text?: string
      lastModified?: GoogleTimestamp
      starRating?: number
      reviewerLanguage?: string
      appVersionName?: string
      appVersionCode?: number
    }
  }>
}

export type GoogleTimestamp = {
  seconds?: string | number
  nanos?: number
}
