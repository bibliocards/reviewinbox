import type { StoreReviewAdapter } from '../index'
import {
  publishAppleAppStoreReply,
  syncAppleAppStoreReviews,
  verifyAppleCredentialForApp,
} from './client'
import type { AppleAppStoreCredential, AppleStoreAdapterErrorCode } from './types'

export const appleAppStoreReviewAdapter: StoreReviewAdapter<
  AppleAppStoreCredential,
  AppleStoreAdapterErrorCode
> = {
  provider: 'apple_app_store',
  verifyCredential: (request) => {
    const input: Parameters<typeof verifyAppleCredentialForApp>[0] = {
      appStoreAppId: request.externalAppId,
      credential: request.credential,
    }
    if (request.timeoutMs !== undefined) {
      input.timeoutMs = request.timeoutMs
    }
    return verifyAppleCredentialForApp(input)
  },
  syncReviews: (request) => {
    const input: Parameters<typeof syncAppleAppStoreReviews>[0] = {
      appStoreAppId: request.externalAppId,
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
    return syncAppleAppStoreReviews(input)
  },
  publishReply: (request) => {
    const input: Parameters<typeof publishAppleAppStoreReply>[0] = {
      appStoreAppId: request.externalAppId,
      externalReviewId: request.externalReviewId,
      replyText: request.replyText,
      credential: request.credential,
    }
    if (request.timeoutMs !== undefined) {
      input.timeoutMs = request.timeoutMs
    }
    return publishAppleAppStoreReply(input)
  },
}
