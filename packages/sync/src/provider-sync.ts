import {
  appleAppStoreReviewAdapter,
  googlePlayReviewAdapter,
  type ReviewSyncCheckpoint,
} from '@reviewinbox/store-adapters'

import { parseAppleCredentialPlaintext, parseGooglePlayCredentialPlaintext } from './credentials'
import { SyncRunFailureError } from './sync-errors'

export function syncAppleReviews(input: {
  appStoreAppId: string
  credentialPlaintext: string
  checkpoint: ReviewSyncCheckpoint | null
  maxPages?: number
}) {
  const credentialResult = parseAppleCredentialPlaintext(input.credentialPlaintext)
  if (!credentialResult.ok) {
    throw new SyncRunFailureError('invalid_credential_format')
  }

  const request: Parameters<typeof appleAppStoreReviewAdapter.syncReviews>[0] = {
    externalAppId: input.appStoreAppId,
    credential: credentialResult.credential,
    checkpoint: input.checkpoint,
  }
  if (input.maxPages !== undefined) {
    request.maxPages = input.maxPages
  }
  return appleAppStoreReviewAdapter.syncReviews(request)
}

export function syncGoogleReviews(input: {
  packageName: string
  credentialPlaintext: string
  checkpoint: ReviewSyncCheckpoint | null
  maxPages?: number
}) {
  const credentialResult = parseGooglePlayCredentialPlaintext(input.credentialPlaintext)
  if (!credentialResult.ok) {
    throw new SyncRunFailureError('invalid_google_credential_format')
  }

  const request: Parameters<typeof googlePlayReviewAdapter.syncReviews>[0] = {
    externalAppId: input.packageName,
    credential: credentialResult.credential,
    checkpoint: input.checkpoint,
  }
  if (input.maxPages !== undefined) {
    request.maxPages = input.maxPages
  }
  return googlePlayReviewAdapter.syncReviews(request)
}
