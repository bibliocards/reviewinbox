import type { AppleStoreAdapterErrorCode, GooglePlayStoreAdapterErrorCode } from '@reviewinbox/store-adapters'

export class SyncStoreConnectionNotFoundError extends Error {
  constructor() {
    super('Store Connection not found.')
    this.name = 'SyncStoreConnectionNotFoundError'
  }
}

export class SyncRunFailureError extends Error {
  constructor(readonly code: string) {
    super('Review sync failed.')
    this.name = 'SyncRunFailureError'
  }
}

export function toSafeVerificationError(errorCode: AppleStoreAdapterErrorCode) {
  return { errorCode, errorMessage: getSafeSyncErrorMessage(errorCode) }
}

export function toSafeGoogleVerificationError(errorCode: GooglePlayStoreAdapterErrorCode) {
  return { errorCode, errorMessage: getSafeSyncErrorMessage(errorCode) }
}

export function getSafeSyncErrorMessage(errorCode: string) {
  switch (errorCode) {
    case 'apple_auth_failed':
      return 'Apple App Store credential is invalid.'
    case 'apple_forbidden':
      return 'Apple App Store credential cannot access reviews for this app.'
    case 'apple_not_found':
      return 'Apple App Store app was not found for this credential.'
    case 'apple_rate_limited':
      return 'Apple App Store review API rate limit was reached.'
    case 'apple_invalid_response':
      return 'Apple App Store review API returned an invalid response.'
    case 'apple_unavailable':
      return 'Apple App Store review API is unavailable.'
    case 'google_auth_failed':
      return 'Google Play Store Credential is invalid.'
    case 'google_forbidden':
      return 'Google Play Store Credential cannot access reviews for this app.'
    case 'google_not_found':
      return 'Google Play app was not found for this credential.'
    case 'google_rate_limited':
      return 'Google Play review API rate limit was reached.'
    case 'google_invalid_response':
      return 'Google Play review API returned an invalid response.'
    case 'google_unavailable':
      return 'Google Play review API is unavailable.'
    case 'invalid_credential_format':
      return 'Apple Store Credential format is invalid.'
    case 'invalid_google_credential_format':
      return 'Google Play Store Credential format is invalid.'
    case 'missing_credential':
      return 'Store Connection has no Store Credential.'
    case 'missing_external_app_id':
      return 'Store Connection has no Apple App Store app identifier.'
    case 'store_connection_disabled':
      return 'Store Connection is disabled.'
    case 'unsupported_store_provider':
      return 'Store Connection provider is not supported by this sync.'
    case 'monthly_review_import_cap_reached':
      return 'Monthly Review import limit reached.'
    default:
      return 'Review sync failed.'
  }
}
