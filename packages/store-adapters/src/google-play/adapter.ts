import type { StoreReviewAdapter } from '../index'
import { publishGooglePlayReply, syncGooglePlayReviews, verifyGooglePlayCredentialForApp } from './client'
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
  publishReply: (request) =>
    publishGooglePlayReply({
      packageName: request.externalAppId,
      externalReviewId: request.externalReviewId,
      replyText: request.replyText,
      credential: request.credential,
      ...(request.timeoutMs !== undefined ? { timeoutMs: request.timeoutMs } : {}),
    }),
}
