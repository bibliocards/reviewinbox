import type { WebEnvironment } from './environment.model'

export const environment: WebEnvironment = {
  production: false,
  primeNgLicenseKey: '',
  apiUrl: '',
  authBasePath: '/api/auth',
  deploymentMode: 'self-hosted',
  auth: { google: false, enterpriseSso: false },
}
