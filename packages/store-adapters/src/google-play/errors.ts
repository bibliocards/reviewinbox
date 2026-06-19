import type { GooglePlayStoreAdapterErrorCode } from './types'

export class GooglePlayStoreAdapterError extends Error {
  constructor(
    readonly code: GooglePlayStoreAdapterErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'GooglePlayStoreAdapterError'
  }
}

export function toGooglePlayStoreAdapterError(status: number) {
  if (status === 400 || status === 401) {
    return new GooglePlayStoreAdapterError('google_auth_failed', 'Google Play Store Credential is invalid.', status)
  }
  if (status === 403) {
    return new GooglePlayStoreAdapterError('google_forbidden', 'Google Play Store Credential cannot access reviews for this app.', status)
  }
  if (status === 404) {
    return new GooglePlayStoreAdapterError('google_not_found', 'Google Play app was not found for this credential.', status)
  }
  if (status === 429) {
    return new GooglePlayStoreAdapterError('google_rate_limited', 'Google Play review API rate limit was reached.', status)
  }

  return new GooglePlayStoreAdapterError('google_unavailable', 'Google Play review API is unavailable.', status)
}
