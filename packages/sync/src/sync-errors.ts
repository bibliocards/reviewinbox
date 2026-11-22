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
  [
    'apple_agreement_required',
    'A required Apple agreement is not in effect. Ask the Account Holder to check the agreements in App Store Connect.',
  ],
  [
    'apple_auth_failed',
    'Apple rejected authentication. Check the Issuer ID, Key ID, and matching private key.',
  ],
  [
    'apple_forbidden',
    'Apple denied access to Reviews without specifying why. Check the Apple team, App ID, and key permissions.',
  ],
  ['apple_not_found', 'Apple App Store app was not found for this credential.'],
  ['apple_rate_limited', 'Apple App Store review API rate limit was reached.'],
  ['apple_invalid_response', 'Apple App Store review API returned an invalid response.'],
  ['apple_unavailable', 'Apple App Store review API is unavailable.'],
  [
    'google_auth_failed',
    'Google Play rejected the sync request. The cause is not confirmed; check the service account and its access.',
  ],
  [
    'google_forbidden',
    'Google Play denied the sync request without confirming the cause. Check Play Console access and API limits.',
  ],
  [
    'google_not_found',
    'Google Play returned not found. Check the package name, app access, and Google Play API configuration.',
  ],
  ['google_rate_limited', 'Google Play review API rate limit was reached.'],
  ['google_invalid_response', 'Google Play review API returned an invalid response.'],
  ['google_unavailable', 'Google Play review API is unavailable.'],
  ['invalid_credential_format', 'Apple Store Credential format is invalid.'],
  ['invalid_google_credential_format', 'Google Play Store Credential format is invalid.'],
  ['missing_credential', 'Store Connection has no Store Credential.'],
  ['missing_external_app_id', 'Store Connection has no external app identifier.'],
  ['store_connection_disabled', 'Store Connection is disabled.'],
  ['unsupported_store_provider', 'Store Connection provider is not supported by this sync.'],
  ['monthly_review_import_cap_reached', 'Monthly Review import limit reached.'],
])
