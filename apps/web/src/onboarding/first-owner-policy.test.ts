import { describe, expect, it } from "vitest"

import { canCreateFirstOwner } from "./first-owner-policy.js"

describe("canCreateFirstOwner", () => {
  it("allows the first self-hosted user", () => {
    expect(canCreateFirstOwner({ mode: "self-hosted", ownerCount: 0, userCount: 0 })).toBe(true)
  })

  it("allows recovery when exactly one user exists without an Owner", () => {
    expect(canCreateFirstOwner({ mode: "self-hosted", ownerCount: 0, userCount: 1 })).toBe(true)
  })

  it("closes self-hosted onboarding after an Owner exists", () => {
    expect(canCreateFirstOwner({ mode: "self-hosted", ownerCount: 1, userCount: 1 })).toBe(false)
  })

  it("closes self-hosted onboarding after multiple users exist", () => {
    expect(canCreateFirstOwner({ mode: "self-hosted", ownerCount: 0, userCount: 2 })).toBe(false)
  })

  it("keeps Cloud Service signup fail-closed for now", () => {
    expect(canCreateFirstOwner({ mode: "cloud", ownerCount: 0, userCount: 0 })).toBe(false)
  })
})
