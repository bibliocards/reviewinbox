import { describe, expect, it } from "vitest"

import {
  canManageStoreCredential,
  validateStoreCredentialInput,
} from "./store-credential-policy.js"

describe("validateStoreCredentialInput", () => {
  it("accepts Store Credential material without parsing or logging it", () => {
    expect(
      validateStoreCredentialInput({ credentialMaterial: ' {"privateKey":"secret"} ' }),
    ).toEqual({
      ok: true,
      credentialMaterial: ' {"privateKey":"secret"} ',
    })
  })

  it("rejects blank Store Credential material", () => {
    expect(validateStoreCredentialInput({ credentialMaterial: "   " })).toEqual({
      ok: false,
      message: "Store Credential material is required.",
    })
  })

  it("rejects oversized Store Credential material", () => {
    expect(validateStoreCredentialInput({ credentialMaterial: "x".repeat(20_001) })).toEqual({
      ok: false,
      message: "Store Credential material must be 20,000 characters or fewer.",
    })
  })
})

describe("canManageStoreCredential", () => {
  it("allows Owners and admins to manage Store Credentials", () => {
    expect(canManageStoreCredential({ memberRole: "owner" })).toBe(true)
    expect(canManageStoreCredential({ memberRole: "admin" })).toBe(true)
  })

  it("does not allow regular members to manage Store Credentials", () => {
    expect(canManageStoreCredential({ memberRole: "member" })).toBe(false)
  })
})
