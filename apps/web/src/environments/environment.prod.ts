// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Docker/nginx envsubst replaces these placeholders at container startup.
import type { WebEnvironment } from './environment.model'

export const environment: WebEnvironment = {
  production: true,
  apiUrl: '${REVIEWINBOX_API_URL}',
  authBasePath: '${REVIEWINBOX_AUTH_BASE_PATH}',
  deploymentMode: '${DEPLOYMENT_MODE}',
  auth: {
    google: '${REVIEWINBOX_AUTH_GOOGLE_ENABLED}',
    enterpriseSso: '${REVIEWINBOX_AUTH_SSO_ENABLED}',
  },
}
