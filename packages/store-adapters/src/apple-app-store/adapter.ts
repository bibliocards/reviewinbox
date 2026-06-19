import type { StoreReviewAdapter } from '../index'
import { syncAppleAppStoreReviews, verifyAppleCredentialForApp } from './client'
import type { AppleAppStoreCredential, AppleStoreAdapterErrorCode } from './types'

export const appleAppStoreReviewAdapter: StoreReviewAdapter<AppleAppStoreCredential, AppleStoreAdapterErrorCode> = {
  provider: 'apple_app_store',
  verifyCredential: (request) =>
    verifyAppleCredentialForApp({
      appStoreAppId: request.externalAppId,
      credential: request.credential,
      ...(request.timeoutMs !== undefined ? { timeoutMs: request.timeoutMs } : {}),
    }),
  syncReviews: (request) =>
    syncAppleAppStoreReviews({
      appStoreAppId: request.externalAppId,
      credential: request.credential,
      checkpoint: request.checkpoint,
      ...(request.maxPages !== undefined ? { maxPages: request.maxPages } : {}),
      ...(request.pageLimit !== undefined ? { pageLimit: request.pageLimit } : {}),
      ...(request.timeoutMs !== undefined ? { timeoutMs: request.timeoutMs } : {}),
    }),
}
