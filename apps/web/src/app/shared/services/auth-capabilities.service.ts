import { HttpClient } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import type { ClientConfigResponse } from '@reviewinbox/contracts'
import { catchError, map, of, shareReplay } from 'rxjs'
import { environment } from '../../../environments/environment'
import { resolveBoolean, resolveDeploymentMode, resolveOptionalString } from '../../../environments/environment.model'

export type AuthCapabilities = {
  deploymentMode: 'self-hosted' | 'cloud'
  isCloud: boolean
  appPublicUrl: string
  emailPassword: boolean
  google: boolean
  enterpriseSso: boolean
  externalProviders: boolean
  signUpAvailable: boolean
  invitationEmailEnabled: boolean
}

@Injectable({ providedIn: 'root' })
export class AuthCapabilitiesService {
  private readonly http = inject(HttpClient)
  private readonly apiUrl = resolveOptionalString(environment.apiUrl) ?? ''

  readonly capabilities: AuthCapabilities = {
    deploymentMode: resolveDeploymentMode(environment.deploymentMode),
    isCloud: resolveDeploymentMode(environment.deploymentMode) === 'cloud',
    appPublicUrl: globalThis.location?.origin ?? 'http://localhost:4200',
    emailPassword: true,
    google: resolveBoolean(environment.auth.google),
    enterpriseSso: resolveBoolean(environment.auth.enterpriseSso),
    externalProviders: resolveDeploymentMode(environment.deploymentMode) === 'cloud',
    signUpAvailable: true,
    invitationEmailEnabled: false,
  }

  private readonly clientConfig$ = this.http.get<ClientConfigResponse>(`${this.apiUrl}/api/client-config`).pipe(
    catchError(() =>
      of({
        deploymentMode: this.capabilities.deploymentMode,
        isCloud: this.capabilities.isCloud,
        appPublicUrl: this.capabilities.appPublicUrl,
        auth: {
          emailPassword: this.capabilities.emailPassword,
          google: this.capabilities.google,
          enterpriseSso: this.capabilities.enterpriseSso,
          signUpAvailable: this.capabilities.deploymentMode === 'cloud',
        },
        mail: {
          invitationEmailEnabled: this.capabilities.invitationEmailEnabled,
        },
      }),
    ),
    shareReplay({ bufferSize: 1, refCount: true }),
  )

  signUpAvailable() {
    return this.clientConfig().pipe(map((config) => config.auth.signUpAvailable))
  }

  clientConfig() {
    return this.clientConfig$
  }
}
