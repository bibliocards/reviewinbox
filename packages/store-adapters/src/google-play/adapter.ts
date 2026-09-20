import type { StoreReviewAdapter } from '../index'
import {
  publishGooglePlayReply,
  syncGooglePlayReviews,
  verifyGooglePlayCredentialForApp,
} from './client'
import type { GooglePlayServiceAccountCredential, GooglePlayStoreAdapterErrorCode } from './types'

export const googlePlayReviewAdapter: StoreReviewAdapter<
  GooglePlayServiceAccountCredential,
  GooglePlayStoreAdapterErrorCode
> = {
  provider: 'google_play',
  verifyCredential: (request) => {
    const input: Parameters<typeof verifyGooglePlayCredentialForApp>[0] = {
      packageName: request.externalAppId,
      credential: request.credential,
    }
    if (request.timeoutMs !== undefined) {
      input.timeoutMs = request.timeoutMs
    }
    return verifyGooglePlayCredentialForApp(input)
  },
  syncReviews: (request) => {
    const input: Parameters<typeof syncGooglePlayReviews>[0] = {
      packageName: request.externalAppId,
      credential: request.credential,
      checkpoint: request.checkpoint,
    }
    if (request.maxPages !== undefined) {
      input.maxPages = request.maxPages
    }
    if (request.pageLimit !== undefined) {
      input.pageLimit = request.pageLimit
    }
    if (request.timeoutMs !== undefined) {
      input.timeoutMs = request.timeoutMs
    }
    return syncGooglePlayReviews(input)
  },
  publishReply: (request) => {
    const input: Parameters<typeof publishGooglePlayReply>[0] = {
      packageName: request.externalAppId,
      externalReviewId: request.externalReviewId,
      replyText: request.replyText,
      credential: request.credential,
    }
    if (request.timeoutMs !== undefined) {
      input.timeoutMs = request.timeoutMs
    }
    return publishGooglePlayReply(input)
  },
}
