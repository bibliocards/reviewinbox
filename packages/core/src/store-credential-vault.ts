import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

export const STORE_CREDENTIAL_ENCRYPTION_ALGORITHM = "aes-256-gcm" as const

export type EncryptedStoreCredential = {
  ciphertext: string
  encryptionAlgorithm: typeof STORE_CREDENTIAL_ENCRYPTION_ALGORITHM
  nonce: string
  authTag: string
  keyId: string | null
  keyVersion: number
}

export type StoreCredentialVaultContext = {
  organizationId: string
  appId: string
  storeConnectionId: string
}

export class StoreCredentialVaultError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "StoreCredentialVaultError"
  }
}

export type StoreCredentialVaultOptions = {
  appEncryptionKey: string
  keyId?: string | null
  keyVersion?: number
}

export class StoreCredentialVault {
  readonly #appEncryptionKey: Buffer
  readonly #keyId: string | null
  readonly #keyVersion: number

  constructor(options: StoreCredentialVaultOptions) {
    this.#appEncryptionKey = parseAppEncryptionKey(options.appEncryptionKey)
    this.#keyId = options.keyId ?? null
    this.#keyVersion = options.keyVersion ?? 1

    if (!Number.isInteger(this.#keyVersion) || this.#keyVersion < 1) {
      throw new StoreCredentialVaultError("Store Credential encryption key version is invalid.")
    }
  }

  static fromEnvironment(
    env: Partial<Record<"APP_ENCRYPTION_KEY", string>> = process.env,
    options: Omit<StoreCredentialVaultOptions, "appEncryptionKey"> = {},
  ): StoreCredentialVault {
    if (!env.APP_ENCRYPTION_KEY) {
      throw new StoreCredentialVaultError("APP_ENCRYPTION_KEY must be configured.")
    }

    return new StoreCredentialVault({
      ...options,
      appEncryptionKey: env.APP_ENCRYPTION_KEY,
    })
  }

  encrypt(plaintext: string, context: StoreCredentialVaultContext): EncryptedStoreCredential {
    const nonce = randomBytes(12)
    const cipher = createCipheriv(
      STORE_CREDENTIAL_ENCRYPTION_ALGORITHM,
      this.#appEncryptionKey,
      nonce,
    )
    cipher.setAAD(credentialContextAAD(context, this.#keyVersion))
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
    const authTag = cipher.getAuthTag()

    return {
      ciphertext: ciphertext.toString("base64url"),
      encryptionAlgorithm: STORE_CREDENTIAL_ENCRYPTION_ALGORITHM,
      nonce: nonce.toString("base64url"),
      authTag: authTag.toString("base64url"),
      keyId: this.#keyId,
      keyVersion: this.#keyVersion,
    }
  }

  decrypt(encrypted: EncryptedStoreCredential, context: StoreCredentialVaultContext): string {
    if (encrypted.encryptionAlgorithm !== STORE_CREDENTIAL_ENCRYPTION_ALGORITHM) {
      throw new StoreCredentialVaultError("Store Credential encryption algorithm is unsupported.")
    }

    try {
      const decipher = createDecipheriv(
        STORE_CREDENTIAL_ENCRYPTION_ALGORITHM,
        this.#appEncryptionKey,
        Buffer.from(encrypted.nonce, "base64url"),
      )
      decipher.setAAD(credentialContextAAD(context, encrypted.keyVersion))
      decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64url"))

      return Buffer.concat([
        decipher.update(Buffer.from(encrypted.ciphertext, "base64url")),
        decipher.final(),
      ]).toString("utf8")
    } catch {
      throw new StoreCredentialVaultError("Store Credential could not be decrypted.")
    }
  }
}

function credentialContextAAD(context: StoreCredentialVaultContext, keyVersion: number): Buffer {
  return Buffer.from(
    JSON.stringify({
      appId: context.appId,
      keyVersion,
      organizationId: context.organizationId,
      storeConnectionId: context.storeConnectionId,
    }),
    "utf8",
  )
}

function parseAppEncryptionKey(value: string): Buffer {
  const normalizedValue = value.trim()

  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(normalizedValue)) {
    throw new StoreCredentialVaultError("APP_ENCRYPTION_KEY must be a base64url or base64 value.")
  }

  const appEncryptionKey = Buffer.from(normalizedValue, "base64url")

  if (appEncryptionKey.length !== 32) {
    throw new StoreCredentialVaultError("APP_ENCRYPTION_KEY must decode to 32 bytes.")
  }

  return appEncryptionKey
}
