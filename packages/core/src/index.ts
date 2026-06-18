import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

export const reviewInboxCoreReady = true

export const storeCredentialEncryptionAlgorithm = "aes-256-gcm"
export const storeCredentialEncryptionVersion = 1

export type EncryptedStoreCredential = {
  ciphertext: string
  nonce: string
  authTag: string
  algorithm: typeof storeCredentialEncryptionAlgorithm
  version: typeof storeCredentialEncryptionVersion
  keyId: string
}

export function decodeStoreCredentialEncryptionKey(appEncryptionKey: string): Buffer {
  const key = Buffer.from(appEncryptionKey, "base64")
  assertStoreCredentialEncryptionKey(key)
  return key
}

export function getStoreCredentialEncryptionKeyId(key: Buffer): string {
  assertStoreCredentialEncryptionKey(key)
  return createHash("sha256").update(key).digest("base64url").slice(0, 16)
}

export function encryptStoreCredential(plaintext: string, key: Buffer): EncryptedStoreCredential {
  assertStoreCredentialEncryptionKey(key)

  const nonce = randomBytes(12)
  const cipher = createCipheriv(storeCredentialEncryptionAlgorithm, key, nonce)
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])

  return {
    ciphertext: ciphertext.toString("base64"),
    nonce: nonce.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    algorithm: storeCredentialEncryptionAlgorithm,
    version: storeCredentialEncryptionVersion,
    keyId: getStoreCredentialEncryptionKeyId(key),
  }
}

export function decryptStoreCredential(encrypted: EncryptedStoreCredential, key: Buffer): string {
  assertStoreCredentialEncryptionKey(key)

  if (
    encrypted.algorithm !== storeCredentialEncryptionAlgorithm ||
    encrypted.version !== storeCredentialEncryptionVersion
  ) {
    throw new Error("Unsupported Store Credential encryption metadata.")
  }

  const decipher = createDecipheriv(
    storeCredentialEncryptionAlgorithm,
    key,
    Buffer.from(encrypted.nonce, "base64"),
  )
  decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"))

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8")
}

function assertStoreCredentialEncryptionKey(key: Buffer) {
  if (key.length !== 32) {
    throw new Error("Store Credential encryption requires a 32-byte key.")
  }
}
