export type DeploymentMode = 'self-hosted' | 'cloud'

export type WebEnvironment = {
  production: boolean
  apiUrl: string
  authBasePath: string
  deploymentMode: string
  auth: {
    google: string | boolean
    enterpriseSso: string | boolean
  }
}

export function isPlaceholder(value: string): boolean {
  return value.startsWith('${') && value.endsWith('}')
}

export function resolveOptionalString(value: string): string | undefined {
  if (!value || isPlaceholder(value)) {
    return undefined
  }

  return value
}

export function resolveDeploymentMode(value: string): DeploymentMode {
  return value === 'cloud' ? 'cloud' : 'self-hosted'
}

export function resolveBoolean(value: string | boolean): boolean {
  if (typeof value === 'boolean') {
    return value
  }

  if (isPlaceholder(value)) {
    return false
  }

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}
