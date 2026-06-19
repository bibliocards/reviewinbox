import type { WebEnvironment } from './environment.model'

export const environment: WebEnvironment = {
  production: false,
  apiUrl: '',
  authBasePath: '/api/auth',
  deploymentMode: 'self-hosted',
  auth: {
    google: false,
    enterpriseSso: false,
  },
}
