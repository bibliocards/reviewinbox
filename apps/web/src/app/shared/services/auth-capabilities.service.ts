import { HttpClient } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import type { ClientConfigResponse } from '@reviewinbox/contracts'
import { catchError, map, of } from 'rxjs'
import { environment } from '../../../environments/environment'
import { resolveBoolean, resolveDeploymentMode, resolveOptionalString } from '../../../environments/environment.model'

export type AuthCapabilities = {
  deploymentMode: 'self-hosted' | 'cloud'
  emailPassword: boolean
  google: boolean
  enterpriseSso: boolean
  externalProviders: boolean
  signUpAvailable: boolean
}

@Injectable({ providedIn: 'root' })
export class AuthCapabilitiesService {
  private readonly http = inject(HttpClient)
  private readonly apiUrl = resolveOptionalString(environment.apiUrl) ?? ''

  readonly capabilities: AuthCapabilities = {
    deploymentMode: resolveDeploymentMode(environment.deploymentMode),
    emailPassword: true,
    google: resolveBoolean(environment.auth.google),
    enterpriseSso: resolveBoolean(environment.auth.enterpriseSso),
    externalProviders: resolveDeploymentMode(environment.deploymentMode) === 'cloud',
    signUpAvailable: true,
  }

  signUpAvailable() {
    return this.http.get<ClientConfigResponse>(`${this.apiUrl}/api/client-config`).pipe(
      map((config) => config.auth.signUpAvailable),
      catchError(() => of(this.capabilities.deploymentMode === 'cloud')),
    )
  }
}
