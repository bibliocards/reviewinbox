import { describe, expect, it } from "vitest";
import { deploymentCapabilitiesFor, parseDeploymentMode } from "./index.js";

describe("Deployment Mode", () => {
  it("defaults to self-hosted", () => {
    expect(parseDeploymentMode(undefined)).toBe("self-hosted");
    expect(parseDeploymentMode("")).toBe("self-hosted");
  });

  it("enables cloud-only capabilities in cloud mode", () => {
    expect(deploymentCapabilitiesFor("cloud")).toMatchObject({
      mode: "cloud",
      publicSignup: true,
      managedAi: true,
      billing: true,
      scheduledJobs: true,
    });
  });

  it("keeps self-hosted deployments useful without hosted dependencies", () => {
    expect(deploymentCapabilitiesFor("self-hosted")).toMatchObject({
      mode: "self-hosted",
      firstUserCreatesDefaultOrganization: true,
      managedAi: false,
      hostedEmailDelivery: false,
      hostedBackups: false,
      billing: false,
    });
  });
});
