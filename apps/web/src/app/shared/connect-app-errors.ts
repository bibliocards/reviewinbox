import { z } from 'zod'

const connectAppErrorEnvelopeSchema = z.object({ error: z.unknown().optional() })
export type ConnectAppError = Parameters<typeof connectAppErrorEnvelopeSchema.safeParse>[0]

const connectAppErrorKeys = {
  apple_app_id_required_for_verification:
    'apps.connectDialog.errors.appleAppIdRequiredForVerification',
  apple_auth_failed: 'apps.connectDialog.errors.appleAuthFailed',
  apple_credential_replacement_incomplete:
    'apps.connectDialog.errors.appleCredentialReplacementIncomplete',
  apple_credential_required_for_verification:
    'apps.connectDialog.errors.appleCredentialRequiredForVerification',
  apple_forbidden: 'apps.connectDialog.errors.appleForbidden',
  apple_invalid_response: 'apps.connectDialog.errors.appleUnavailable',
  apple_issuer_change_requires_credential_replacement:
    'apps.connectDialog.errors.appleIssuerChangeRequiresCredentialReplacement',
  apple_not_found: 'apps.connectDialog.errors.appleNotFound',
  apple_rate_limited: 'apps.connectDialog.errors.appleRateLimited',
  apple_unavailable: 'apps.connectDialog.errors.appleUnavailable',
  google_auth_failed: 'apps.connectDialog.errors.googleAuthFailed',
  google_credential_invalid_json: 'apps.connectDialog.errors.googleCredentialInvalidJson',
  google_credential_not_object: 'apps.connectDialog.errors.googleCredentialNotObject',
  google_credential_required_for_verification:
    'apps.connectDialog.errors.googleCredentialRequiredForVerification',
  google_forbidden: 'apps.connectDialog.errors.googleForbidden',
  google_invalid_response: 'apps.connectDialog.errors.googleUnavailable',
  google_not_found: 'apps.connectDialog.errors.googleNotFound',
  google_package_name_required_for_verification:
    'apps.connectDialog.errors.googlePackageNameRequiredForVerification',
  google_rate_limited: 'apps.connectDialog.errors.googleRateLimited',
  google_unavailable: 'apps.connectDialog.errors.googleUnavailable',
  invalid_credential_format: 'apps.connectDialog.errors.appleCredentialInvalidFormat',
  invalid_google_credential_format: 'apps.connectDialog.errors.googleCredentialInvalidFormat',
} satisfies Record<string, string>

const apiErrorBodySchema = z.object({ errorCode: z.string() })

export function connectAppErrorMessageKey(error: ConnectAppError, fallback: string): string {
  const errorCode = apiErrorCode(error)

  return errorCode !== null && isConnectAppErrorCode(errorCode)
    ? connectAppErrorKeys[errorCode]
    : fallback
}

function isConnectAppErrorCode(value: string): value is keyof typeof connectAppErrorKeys {
  return Object.hasOwn(connectAppErrorKeys, value)
}

function apiErrorCode(error: ConnectAppError): string | null {
  const direct = apiErrorBodySchema.safeParse(error)
  if (direct.success) {
    return direct.data.errorCode
  }

  const envelope = connectAppErrorEnvelopeSchema.safeParse(error)
  if (!envelope.success) {
    return null
  }

  const nested = apiErrorBodySchema.safeParse(envelope.data.error)
  return nested.success ? nested.data.errorCode : null
}
