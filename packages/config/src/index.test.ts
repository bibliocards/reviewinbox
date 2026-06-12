import { describe, expect, it } from "vitest"
import {
  deploymentCapabilitiesFor,
  parseDeploymentMode,
  parseDeploymentModeFromEnvironment,
} from "./index.js"

describe("Deployment Mode", () => {
  it("defaults to self-hosted", () => {
    expect(parseDeploymentMode(undefined)).toBe("self-hosted")
    expect(parseDeploymentMode("")).toBe("self-hosted")
  })

  it("defaults environment Deployment Mode to self-hosted", () => {
    expect(parseDeploymentModeFromEnvironment({})).toBe("self-hosted")
    expect(
      parseDeploymentModeFromEnvironment({
        REVIEWINBOX_DEPLOYMENT_MODE: "cloud",
      }),
    ).toBe("cloud")
  })

  it("enables cloud-only capabilities in cloud mode", () => {
    expect(deploymentCapabilitiesFor("cloud")).toMatchObject({
      mode: "cloud",
      publicSignup: true,
      managedAi: true,
      billing: true,
      scheduledJobs: true,
    })
  })

  it("keeps self-hosted deployments useful without hosted dependencies", () => {
    expect(deploymentCapabilitiesFor("self-hosted")).toMatchObject({
      mode: "self-hosted",
      firstUserCreatesDefaultOrganization: true,
      managedAi: false,
      hostedEmailDelivery: false,
      hostedBackups: false,
      billing: false,
    })
  })
})
