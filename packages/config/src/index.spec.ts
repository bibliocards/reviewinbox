import { describe, expect, it } from "vitest"

import { loadServerConfig } from "./index"

describe("loadServerConfig", () => {
  it("uses safe local defaults", () => {
    expect(loadServerConfig({})).toMatchObject({
      deploymentMode: "self-hosted",
      apiHost: "127.0.0.1",
      apiPort: 3000,
    })
  })
})
