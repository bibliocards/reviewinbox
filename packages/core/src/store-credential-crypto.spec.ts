import { describe, expect, it } from "vitest"

import {
  decryptStoreCredential,
  encryptStoreCredential,
  getStoreCredentialEncryptionKeyId,
} from "./index"

describe("Store Credential encryption", () => {
  it("round-trips plaintext without exposing it in the encrypted payload", () => {
    const key = Buffer.alloc(32, 1)
    const plaintext = JSON.stringify({ issuerId: "issuer", credential: "secret" })

    const encrypted = encryptStoreCredential(plaintext, key)

    expect(encrypted.ciphertext).not.toContain("secret")
    expect(encrypted.nonce).not.toEqual("")
    expect(encrypted.keyId).toBe(getStoreCredentialEncryptionKeyId(key))
    expect(decryptStoreCredential(encrypted, key)).toBe(plaintext)
  })

  it("fails authentication with the wrong key", () => {
    const encrypted = encryptStoreCredential("secret", Buffer.alloc(32, 1))

    expect(() => decryptStoreCredential(encrypted, Buffer.alloc(32, 2))).toThrow()
  })
})
