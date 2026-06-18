export type StoreProvider = "apple_app_store" | "google_play"

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

export type StoreReviewSyncRequest = {
  provider: StoreProvider
  externalAppId: string | null
  externalStoreId: string | null
  checkpoint: ReviewSyncCheckpoint | null
}

export type StoreReviewSyncResult = {
  reviews: NormalizedStoreReview[]
  checkpoint: ReviewSyncCheckpoint | null
}

export type StoreReviewAdapter = {
  provider: StoreProvider
  syncReviews(request: StoreReviewSyncRequest): Promise<StoreReviewSyncResult>
}
