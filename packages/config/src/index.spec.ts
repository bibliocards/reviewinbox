import { describe, expect, it } from "vitest"

import { loadEncryptionConfig, loadServerConfig } from "./index"

describe("loadServerConfig", () => {
  it("uses safe local defaults", () => {
    expect(loadServerConfig({})).toMatchObject({
      deploymentMode: "self-hosted",
      apiHost: "127.0.0.1",
      apiPort: 3000,
    })
  })
})

describe("loadEncryptionConfig", () => {
  it("accepts a base64-encoded 32-byte encryption key", () => {
    const appEncryptionKey = Buffer.alloc(32, 1).toString("base64")

    expect(loadEncryptionConfig({ APP_ENCRYPTION_KEY: appEncryptionKey })).toEqual({
      appEncryptionKey,
    })
  })

  it("rejects keys that are not 32 bytes", () => {
    expect(() =>
      loadEncryptionConfig({ APP_ENCRYPTION_KEY: Buffer.alloc(16, 1).toString("base64") }),
    ).toThrow(/32 bytes/)
  })
})
