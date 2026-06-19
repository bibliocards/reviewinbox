import { loadEncryptionConfig } from '@reviewinbox/config'
import { decodeStoreCredentialEncryptionKey, decryptStoreCredential, type EncryptedStoreCredential } from '@reviewinbox/core'
import type { storeCredentials } from '@reviewinbox/db'
import {
  type AppleAppStoreCredential,
  appleAppStoreReviewAdapter,
  type GooglePlayServiceAccountCredential,
  googlePlayReviewAdapter,
} from '@reviewinbox/store-adapters'

import { toSafeGoogleVerificationError, toSafeVerificationError } from './sync-errors'

export type AppleCredentialParseResult = { ok: true; credential: AppleAppStoreCredential } | { ok: false; error: string }
export type GooglePlayCredentialParseResult = { ok: true; credential: GooglePlayServiceAccountCredential } | { ok: false; error: string }

export function parseAppleCredentialPlaintext(value: string): AppleCredentialParseResult {
  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'Apple Store Credential must be a JSON object.' }
    }

    const credential = parsed as Partial<AppleAppStoreCredential>
    if (!credential.issuerId || !credential.keyId || !credential.privateKey) {
      return { ok: false, error: 'Apple Store Credential requires issuerId, keyId, and privateKey.' }
    }

    return {
      ok: true,
      credential: {
        issuerId: credential.issuerId,
        keyId: credential.keyId,
        privateKey: credential.privateKey,
      },
    }
  } catch {
    return { ok: false, error: 'Apple Store Credential must be valid JSON.' }
  }
}

export function parseGooglePlayCredentialPlaintext(value: string): GooglePlayCredentialParseResult {
  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'Google Play Store Credential must be a JSON object.' }
    }

    const credential = parsed as Partial<GooglePlayServiceAccountCredential>
    if (typeof credential.client_email !== 'string' || typeof credential.private_key !== 'string') {
      return { ok: false, error: 'Google Play Store Credential requires client_email and private_key.' }
    }

    return {
      ok: true,
      credential: {
        client_email: credential.client_email,
        private_key: credential.private_key,
      },
    }
  } catch {
    return { ok: false, error: 'Google Play Store Credential must be valid JSON.' }
  }
}

export async function verifyAppleStoreCredentialForApp(input: {
  appStoreAppId: string
  plaintext: string
}): Promise<{ ok: true } | { ok: false; errorCode: string; errorMessage: string }> {
  const credentialResult = parseAppleCredentialPlaintext(input.plaintext)
  if (!credentialResult.ok) {
    return { ok: false, errorCode: 'invalid_credential_format', errorMessage: credentialResult.error }
  }

  const verification = await appleAppStoreReviewAdapter.verifyCredential({
    externalAppId: input.appStoreAppId,
    credential: credentialResult.credential,
  })

  if (!verification.ok) {
    return { ok: false, ...toSafeVerificationError(verification.errorCode) }
  }

  return { ok: true }
}

export async function verifyGooglePlayStoreCredentialForApp(input: {
  packageName: string
  plaintext: string
}): Promise<{ ok: true } | { ok: false; errorCode: string; errorMessage: string }> {
  const credentialResult = parseGooglePlayCredentialPlaintext(input.plaintext)
  if (!credentialResult.ok) {
    return { ok: false, errorCode: 'invalid_google_credential_format', errorMessage: credentialResult.error }
  }

  const verification = await googlePlayReviewAdapter.verifyCredential({
    externalAppId: input.packageName,
    credential: credentialResult.credential,
  })

  if (!verification.ok) {
    return { ok: false, ...toSafeGoogleVerificationError(verification.errorCode) }
  }

  return { ok: true }
}

export function decryptStoreCredentialPlaintext(row: typeof storeCredentials.$inferSelect) {
  return decryptStoreCredential(toEncryptedStoreCredential(row), getEncryptionKey())
}

function getEncryptionKey() {
  return decodeStoreCredentialEncryptionKey(loadEncryptionConfig().appEncryptionKey)
}

function toEncryptedStoreCredential(row: typeof storeCredentials.$inferSelect): EncryptedStoreCredential {
  return {
    ciphertext: row.ciphertext,
    nonce: row.nonce,
    authTag: row.authTag,
    algorithm: row.algorithm as EncryptedStoreCredential['algorithm'],
    version: row.version as EncryptedStoreCredential['version'],
    keyId: row.keyId,
  }
}
