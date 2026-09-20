import type {
  AppleStoreAdapterErrorCode,
  GooglePlayStoreAdapterErrorCode,
} from '@reviewinbox/store-adapters'

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
  return safeSyncErrorMessages.get(errorCode) ?? 'Review sync failed.'
}

const safeSyncErrorMessages = new Map<string, string>([
  ['apple_auth_failed', 'Apple App Store credential is invalid.'],
  ['apple_forbidden', 'Apple App Store credential cannot access reviews for this app.'],
  ['apple_not_found', 'Apple App Store app was not found for this credential.'],
  ['apple_rate_limited', 'Apple App Store review API rate limit was reached.'],
  ['apple_invalid_response', 'Apple App Store review API returned an invalid response.'],
  ['apple_unavailable', 'Apple App Store review API is unavailable.'],
  ['google_auth_failed', 'Google Play Store Credential is invalid.'],
  ['google_forbidden', 'Google Play Store Credential cannot access reviews for this app.'],
  ['google_not_found', 'Google Play app was not found for this credential.'],
  ['google_rate_limited', 'Google Play review API rate limit was reached.'],
  ['google_invalid_response', 'Google Play review API returned an invalid response.'],
  ['google_unavailable', 'Google Play review API is unavailable.'],
  ['invalid_credential_format', 'Apple Store Credential format is invalid.'],
  ['invalid_google_credential_format', 'Google Play Store Credential format is invalid.'],
  ['missing_credential', 'Store Connection has no Store Credential.'],
  ['missing_external_app_id', 'Store Connection has no Apple App Store app identifier.'],
  ['store_connection_disabled', 'Store Connection is disabled.'],
  ['unsupported_store_provider', 'Store Connection provider is not supported by this sync.'],
  ['monthly_review_import_cap_reached', 'Monthly Review import limit reached.'],
])
