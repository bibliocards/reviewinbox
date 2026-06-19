import type { StoreReviewAdapter } from '../index'
import { syncGooglePlayReviews, verifyGooglePlayCredentialForApp } from './client'
import type { GooglePlayServiceAccountCredential, GooglePlayStoreAdapterErrorCode } from './types'

export const googlePlayReviewAdapter: StoreReviewAdapter<GooglePlayServiceAccountCredential, GooglePlayStoreAdapterErrorCode> = {
  provider: 'google_play',
  verifyCredential: (request) =>
    verifyGooglePlayCredentialForApp({
      packageName: request.externalAppId,
      credential: request.credential,
      ...(request.timeoutMs !== undefined ? { timeoutMs: request.timeoutMs } : {}),
    }),
  syncReviews: (request) =>
    syncGooglePlayReviews({
      packageName: request.externalAppId,
      credential: request.credential,
      checkpoint: request.checkpoint,
      ...(request.maxPages !== undefined ? { maxPages: request.maxPages } : {}),
      ...(request.pageLimit !== undefined ? { pageLimit: request.pageLimit } : {}),
      ...(request.timeoutMs !== undefined ? { timeoutMs: request.timeoutMs } : {}),
    }),
}
