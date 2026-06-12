import { describe, expect, it } from "vitest"

import { canCreateApp, hasVerifiedOrganizationMembership, validateAppName } from "./app-policy.js"

describe("validateAppName", () => {
  it("accepts a trimmed App name", () => {
    expect(validateAppName("  Bibliocards  ")).toEqual({ ok: true, name: "Bibliocards" })
  })

  it("rejects a missing App name", () => {
    expect(validateAppName("   ")).toEqual({ ok: false, message: "App name is required." })
  })

  it("rejects an App name over 100 characters", () => {
    expect(validateAppName("a".repeat(101))).toEqual({
      ok: false,
      message: "App name must be 100 characters or fewer.",
    })
  })
})

describe("hasVerifiedOrganizationMembership", () => {
  it("requires membership in the active Organization", () => {
    expect(
      hasVerifiedOrganizationMembership({
        activeOrganizationId: "org_1",
        memberOrganizationId: "org_1",
      }),
    ).toBe(true)
  })

  it("does not trust an active Organization without matching membership", () => {
    expect(
      hasVerifiedOrganizationMembership({
        activeOrganizationId: "org_1",
        memberOrganizationId: "org_2",
      }),
    ).toBe(false)
  })

  it("requires an active Organization", () => {
    expect(
      hasVerifiedOrganizationMembership({
        activeOrganizationId: null,
        memberOrganizationId: "org_1",
      }),
    ).toBe(false)
  })
})

describe("canCreateApp", () => {
  it("allows Owners and admins to create Apps", () => {
    expect(canCreateApp({ memberRole: "owner" })).toBe(true)
    expect(canCreateApp({ memberRole: "admin" })).toBe(true)
  })

  it("does not allow regular members to create Apps", () => {
    expect(canCreateApp({ memberRole: "member" })).toBe(false)
  })
})
