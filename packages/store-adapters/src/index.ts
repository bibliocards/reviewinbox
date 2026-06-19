export type StoreProvider = 'apple_app_store' | 'google_play'

export type NormalizedStoreReview = {
  externalReviewId: string
  authorDisplayName?: string | null
  rating: number
  title?: string | null
  body: string
  language?: string | null
  version?: string | null
  country?: string | null
  locale?: string | null
  reviewedAt: string
  rawPayload?: unknown
}

export type ReviewSyncCheckpoint = Record<string, unknown>

export type StoreReviewSyncOptions = {
  checkpoint: ReviewSyncCheckpoint | null
  maxPages?: number
  pageLimit?: number
  timeoutMs?: number
}

export type StoreReviewSyncRequest<TCredential> = StoreReviewSyncOptions & {
  externalAppId: string
  credential: TCredential
}

export type StoreCredentialVerificationRequest<TCredential> = {
  externalAppId: string
  credential: TCredential
  timeoutMs?: number
}

export type StoreCredentialVerificationResult<TErrorCode extends string> =
  | { ok: true }
  | { ok: false; errorCode: TErrorCode; status?: number }

export type StoreReviewSyncResult = {
  reviews: NormalizedStoreReview[]
  checkpoint: ReviewSyncCheckpoint | null
}

export type StoreReviewAdapter<TCredential, TErrorCode extends string = string> = {
  provider: StoreProvider
  verifyCredential(request: StoreCredentialVerificationRequest<TCredential>): Promise<StoreCredentialVerificationResult<TErrorCode>>
  syncReviews(request: StoreReviewSyncRequest<TCredential>): Promise<StoreReviewSyncResult>
}

export * from './apple-app-store'
export * from './google-play'
