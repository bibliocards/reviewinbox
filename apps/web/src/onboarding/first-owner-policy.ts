import { deploymentCapabilitiesFor, type DeploymentMode } from "@reviewinbox/config"

export type FirstOwnerPolicyInput = {
  mode: DeploymentMode
  ownerCount: number
  userCount: number
}

export function canCreateFirstOwner(input: FirstOwnerPolicyInput): boolean {
  const capabilities = deploymentCapabilitiesFor(input.mode)

  return (
    capabilities.firstUserCreatesDefaultOrganization &&
    input.ownerCount === 0 &&
    (input.userCount === 0 || input.userCount === 1)
  )
}
