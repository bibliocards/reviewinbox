import { randomBytes } from "node:crypto"
import { describe, expect, it } from "vitest"

import { StoreCredentialVault, StoreCredentialVaultError } from "./store-credential-vault.js"

function appEncryptionKey(): string {
  return randomBytes(32).toString("base64url")
}

const context = {
  organizationId: "org_1",
  appId: "2b2e3d87-0a2d-46e8-a53d-2cc48e702c07",
  storeConnectionId: "66ccce0f-a21c-4b44-bbc2-a693817ad5e1",
} as const

describe("StoreCredentialVault", () => {
  it("round-trips Store Credential plaintext", () => {
    const vault = new StoreCredentialVault({ appEncryptionKey: appEncryptionKey() })

    const encrypted = vault.encrypt('{"issuerId":"issuer","privateSecret":"secret"}', context)

    expect(vault.decrypt(encrypted, context)).toBe('{"issuerId":"issuer","privateSecret":"secret"}')
    expect(encrypted).toMatchObject({
      encryptionAlgorithm: "aes-256-gcm",
      keyId: null,
      keyVersion: 1,
    })
  })

  it("uses a random nonce for each encryption", () => {
    const vault = new StoreCredentialVault({ appEncryptionKey: appEncryptionKey() })

    const first = vault.encrypt("same Store Credential", context)
    const second = vault.encrypt("same Store Credential", context)

    expect(first.nonce).not.toBe(second.nonce)
    expect(first.ciphertext).not.toBe(second.ciphertext)
  })

  it("fails decryption with the wrong APP_ENCRYPTION_KEY", () => {
    const vault = new StoreCredentialVault({ appEncryptionKey: appEncryptionKey() })
    const wrongVault = new StoreCredentialVault({ appEncryptionKey: appEncryptionKey() })

    const encrypted = vault.encrypt("secret Store Credential", context)

    expect(() => wrongVault.decrypt(encrypted, context)).toThrow(StoreCredentialVaultError)
    expect(() => wrongVault.decrypt(encrypted, context)).toThrow(
      "Store Credential could not be decrypted.",
    )
  })

  it("binds encrypted Store Credentials to their ownership context", () => {
    const vault = new StoreCredentialVault({ appEncryptionKey: appEncryptionKey() })

    const encrypted = vault.encrypt("secret Store Credential", context)

    expect(() =>
      vault.decrypt(encrypted, {
        ...context,
        organizationId: "org_2",
      }),
    ).toThrow("Store Credential could not be decrypted.")
  })

  it("rejects invalid APP_ENCRYPTION_KEY values", () => {
    expect(() => new StoreCredentialVault({ appEncryptionKey: "not strong enough" })).toThrow(
      "APP_ENCRYPTION_KEY must be a base64url or base64 value.",
    )
    expect(
      () => new StoreCredentialVault({ appEncryptionKey: randomBytes(16).toString("base64") }),
    ).toThrow("APP_ENCRYPTION_KEY must decode to 32 bytes.")
  })
})
