import { loadEncryptionConfig } from '@reviewinbox/config'
import {
  decodeStoreCredentialEncryptionKey,
  decryptStoreCredential,
  storeCredentialEncryptionAlgorithm,
  storeCredentialEncryptionVersion,
  type EncryptedStoreCredential,
} from '@reviewinbox/core'
import type { storeCredentials } from '@reviewinbox/db'
import {
  type AppleAppStoreCredential,
  appleAppStoreReviewAdapter,
  type GooglePlayServiceAccountCredential,
  googlePlayReviewAdapter,
} from '@reviewinbox/store-adapters'
import { z } from 'zod'

import { toSafeGoogleVerificationError, toSafeVerificationError } from './sync-errors'

const appleCredentialSchema = z.object({
  issuerId: z.string().min(1),
  keyId: z.string().min(1),
  privateKey: z.string().min(1),
})
const googlePlayCredentialSchema = z.object({
  client_email: z.string().min(1),
  private_key: z.string().min(1),
})

export type AppleCredentialParseResult =
  | { ok: true; credential: AppleAppStoreCredential }
  | { ok: false; error: string }
export type GooglePlayCredentialParseResult =
  | { ok: true; credential: GooglePlayServiceAccountCredential }
  | { ok: false; error: string }

export function parseAppleCredentialPlaintext(value: string): AppleCredentialParseResult {
  try {
    const parsed = appleCredentialSchema.safeParse(JSON.parse(value))
    if (parsed.success) {
      return { ok: true, credential: parsed.data }
    }
    return { ok: false, error: 'Apple Store Credential requires issuerId, keyId, and privateKey.' }
  } catch {
    return { ok: false, error: 'Apple Store Credential must be valid JSON.' }
  }
}

export function parseGooglePlayCredentialPlaintext(value: string): GooglePlayCredentialParseResult {
  try {
    const parsed = googlePlayCredentialSchema.safeParse(JSON.parse(value))
    if (parsed.success) {
      return { ok: true, credential: parsed.data }
    }
    return {
      ok: false,
      error: 'Google Play Store Credential requires client_email and private_key.',
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
    return {
      ok: false,
      errorCode: 'invalid_credential_format',
      errorMessage: credentialResult.error,
    }
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
    return {
      ok: false,
      errorCode: 'invalid_google_credential_format',
      errorMessage: credentialResult.error,
    }
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

function toEncryptedStoreCredential(
  row: typeof storeCredentials.$inferSelect,
): EncryptedStoreCredential {
  if (row.algorithm !== storeCredentialEncryptionAlgorithm) {
    throw new Error('Unsupported Store Credential encryption metadata.')
  }
  if (row.version !== storeCredentialEncryptionVersion) {
    throw new Error('Unsupported Store Credential encryption metadata.')
  }
  return {
    ciphertext: row.ciphertext,
    nonce: row.nonce,
    authTag: row.authTag,
    algorithm: storeCredentialEncryptionAlgorithm,
    version: storeCredentialEncryptionVersion,
    keyId: row.keyId,
  }
}
