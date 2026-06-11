export type DeploymentMode = "self-hosted" | "cloud";

export type DeploymentCapabilities = {
  mode: DeploymentMode;
  publicSignup: boolean;
  firstUserCreatesDefaultOrganization: boolean;
  managedAi: boolean;
  hostedEmailDelivery: boolean;
  hostedBackups: boolean;
  billing: boolean;
  scheduledJobs: boolean;
};

const SELF_HOSTED_CAPABILITIES = {
  mode: "self-hosted",
  publicSignup: false,
  firstUserCreatesDefaultOrganization: true,
  managedAi: false,
  hostedEmailDelivery: false,
  hostedBackups: false,
  billing: false,
  scheduledJobs: false,
} as const satisfies DeploymentCapabilities;

const CLOUD_CAPABILITIES = {
  mode: "cloud",
  publicSignup: true,
  firstUserCreatesDefaultOrganization: false,
  managedAi: true,
  hostedEmailDelivery: true,
  hostedBackups: true,
  billing: true,
  scheduledJobs: true,
} as const satisfies DeploymentCapabilities;

export function parseDeploymentMode(value: string | undefined): DeploymentMode {
  if (value === undefined || value === "") {
    return "self-hosted";
  }

  if (value === "self-hosted" || value === "cloud") {
    return value;
  }

  throw new Error(`Unknown ReviewInbox deployment mode: ${value}`);
}

export function deploymentCapabilitiesFor(mode: DeploymentMode): DeploymentCapabilities {
  switch (mode) {
    case "self-hosted":
      return SELF_HOSTED_CAPABILITIES;
    case "cloud":
      return CLOUD_CAPABILITIES;
  }
}
