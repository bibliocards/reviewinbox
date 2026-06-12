import { describe, expect, it } from "vitest"

import {
  canCreateStoreConnection,
  validateStoreConnectionInput,
} from "./store-connection-policy.js"

describe("validateStoreConnectionInput", () => {
  it("accepts public Store Connection fields", () => {
    expect(
      validateStoreConnectionInput({
        store: "apple_app_store",
        externalAppId: " 123456789 ",
        displayName: " App Store listing ",
        syncEnabled: "on",
      }),
    ).toEqual({
      ok: true,
      store: "apple_app_store",
      externalAppId: "123456789",
      displayName: "App Store listing",
      syncEnabled: true,
    })
  })

  it("allows an empty display name", () => {
    expect(
      validateStoreConnectionInput({
        store: "google_play",
        externalAppId: "com.example.app",
        displayName: " ",
        syncEnabled: false,
      }),
    ).toEqual({
      ok: true,
      store: "google_play",
      externalAppId: "com.example.app",
      displayName: null,
      syncEnabled: false,
    })
  })

  it("rejects an unsupported store", () => {
    expect(
      validateStoreConnectionInput({
        store: "unknown",
        externalAppId: "123456789",
        displayName: "",
        syncEnabled: true,
      }),
    ).toEqual({ ok: false, message: "Store is required." })
  })

  it("rejects a missing External App ID", () => {
    expect(
      validateStoreConnectionInput({
        store: "apple_app_store",
        externalAppId: " ",
        displayName: "",
        syncEnabled: true,
      }),
    ).toEqual({ ok: false, message: "External App ID is required." })
  })
})

describe("canCreateStoreConnection", () => {
  it("allows Owners and admins to create Store Connections", () => {
    expect(canCreateStoreConnection({ memberRole: "owner" })).toBe(true)
    expect(canCreateStoreConnection({ memberRole: "admin" })).toBe(true)
  })

  it("does not allow regular members to create Store Connections", () => {
    expect(canCreateStoreConnection({ memberRole: "member" })).toBe(false)
  })
})
