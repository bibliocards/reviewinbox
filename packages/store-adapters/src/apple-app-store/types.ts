import type { ReviewSyncCheckpoint, StoreCredentialVerificationResult } from '../index'

export type AppleAppStoreCredential = {
  issuerId: string
  keyId: string
  privateKey: string
}

export type AppleReviewSyncRequest = {
  appStoreAppId: string
  credential: AppleAppStoreCredential
  checkpoint: ReviewSyncCheckpoint | null
  maxPages?: number
  pageLimit?: number
  timeoutMs?: number
}

export type AppleStoreAdapterErrorCode =
  | 'apple_auth_failed'
  | 'apple_forbidden'
  | 'apple_not_found'
  | 'apple_rate_limited'
  | 'apple_unavailable'
  | 'apple_invalid_response'

export type AppleCredentialVerificationResult = StoreCredentialVerificationResult<AppleStoreAdapterErrorCode>

export type AppleCustomerReviewsResponse = {
  data: AppleCustomerReviewResource[]
  links?: {
    next?: string
  }
}

export type AppleCustomerReviewResource = {
  id: string
  attributes?: Record<string, unknown>
}
