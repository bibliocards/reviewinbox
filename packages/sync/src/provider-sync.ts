import { appleAppStoreReviewAdapter, googlePlayReviewAdapter } from '@reviewinbox/store-adapters'

import { parseAppleCredentialPlaintext, parseGooglePlayCredentialPlaintext } from './credentials'
import { SyncRunFailureError } from './sync-errors'

export async function syncAppleReviews(input: {
  appStoreAppId: string
  credentialPlaintext: string
  checkpoint: Record<string, unknown> | null
  maxPages?: number
}) {
  const credentialResult = parseAppleCredentialPlaintext(input.credentialPlaintext)
  if (!credentialResult.ok) {
    throw new SyncRunFailureError('invalid_credential_format')
  }

  return appleAppStoreReviewAdapter.syncReviews({
    externalAppId: input.appStoreAppId,
    credential: credentialResult.credential,
    checkpoint: input.checkpoint,
    ...(input.maxPages !== undefined ? { maxPages: input.maxPages } : {}),
  })
}

export async function syncGoogleReviews(input: {
  packageName: string
  credentialPlaintext: string
  checkpoint: Record<string, unknown> | null
  maxPages?: number
}) {
  const credentialResult = parseGooglePlayCredentialPlaintext(input.credentialPlaintext)
  if (!credentialResult.ok) {
    throw new SyncRunFailureError('invalid_google_credential_format')
  }

  return googlePlayReviewAdapter.syncReviews({
    externalAppId: input.packageName,
    credential: credentialResult.credential,
    checkpoint: input.checkpoint,
    ...(input.maxPages !== undefined ? { maxPages: input.maxPages } : {}),
  })
}
