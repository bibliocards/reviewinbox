import { describe, expect, it } from "vitest"

import {
  createAppRequestSchema,
  createStoreConnectionRequestSchema,
  putStoreCredentialRequestSchema,
  storeConnectionResponseSchema,
  storeCredentialResponseSchema,
} from "./index"

const isoDate = "2026-06-18T10:00:00.000Z"
const appId = "11111111-1111-4111-8111-111111111111"
const storeConnectionId = "22222222-2222-4222-8222-222222222222"

describe("App and Store Connection contracts", () => {
  it("rejects Organization input on App creation", () => {
    expect(() =>
      createAppRequestSchema.parse({
        name: "My App",
        organizationId: "org_123",
      }),
    ).toThrow()
  })

  it("accepts only safe Store Connection fields", () => {
    expect(
      createStoreConnectionRequestSchema.parse({
        provider: "apple_app_store",
        displayName: "Production App Store",
      }),
    ).toEqual({
      provider: "apple_app_store",
      displayName: "Production App Store",
    })

    expect(() =>
      createStoreConnectionRequestSchema.parse({
        provider: "apple_app_store",
        organizationId: "org_123",
      }),
    ).toThrow()
  })

  it("does not model plaintext or ciphertext in Store Connection responses", () => {
    const response = storeConnectionResponseSchema.parse({
      id: storeConnectionId,
      appId,
      provider: "google_play",
      status: "active",
      externalAppId: null,
      externalStoreId: null,
      displayName: null,
      createdAt: isoDate,
      updatedAt: isoDate,
      credential: {
        hasCredential: false,
        updatedAt: null,
        keyId: null,
      },
    })

    expect(JSON.stringify(response)).not.toContain("plaintext")
    expect(JSON.stringify(response)).not.toContain("ciphertext")
  })

  it("models Store Credential replacement as plaintext input and metadata output", () => {
    expect(putStoreCredentialRequestSchema.parse({ plaintext: "secret material" })).toEqual({
      plaintext: "secret material",
    })

    const response = storeCredentialResponseSchema.parse({
      storeConnectionId,
      credential: {
        hasCredential: true,
        updatedAt: isoDate,
        keyId: "abc123",
      },
    })

    expect(response.credential).toEqual({
      hasCredential: true,
      updatedAt: isoDate,
      keyId: "abc123",
    })
  })
})
