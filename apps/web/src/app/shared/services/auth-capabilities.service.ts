import { HttpClient } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import type { ClientConfigResponse } from '@reviewinbox/contracts'
import { addHours } from 'date-fns'
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
  availableBillingPlans: Array<'starter' | 'pro' | 'business'>
}

@Injectable({ providedIn: 'root' })
export class AuthCapabilitiesService {
  private readonly http = inject(HttpClient)
  private readonly apiUrl = resolveOptionalString(environment.apiUrl) ?? ''

  private readonly fallbackCapabilities: AuthCapabilities = {
    deploymentMode: resolveDeploymentMode(environment.deploymentMode),
    isCloud: resolveDeploymentMode(environment.deploymentMode) === 'cloud',
    appPublicUrl: globalThis.location?.origin ?? 'http://localhost:4200',
    emailPassword: true,
    google: resolveBoolean(environment.auth.google),
    enterpriseSso: resolveBoolean(environment.auth.enterpriseSso),
    externalProviders: resolveDeploymentMode(environment.deploymentMode) === 'cloud',
    signUpAvailable: true,
    invitationEmailEnabled: false,
    availableBillingPlans: [],
  }

  private readonly clientConfig$ = this.http.get<ClientConfigResponse>(`${this.apiUrl}/api/client-config`).pipe(
    catchError(() =>
      of({
        deploymentMode: this.fallbackCapabilities.deploymentMode,
        isCloud: this.fallbackCapabilities.isCloud,
        appPublicUrl: this.fallbackCapabilities.appPublicUrl,
        auth: {
          emailPassword: this.fallbackCapabilities.emailPassword,
          google: this.fallbackCapabilities.google,
          enterpriseSso: this.fallbackCapabilities.enterpriseSso,
          signUpAvailable: this.fallbackCapabilities.deploymentMode === 'cloud',
        },
        mail: {
          invitationEmailEnabled: this.fallbackCapabilities.invitationEmailEnabled,
        },
        autoSync: {
          reviewsEnabled: true,
          nextWindowStartsAt: nextSixHourUtcWindow().toISOString(),
          spreadWindowMinutes: 60,
        },
        billing: {
          availablePlans: this.fallbackCapabilities.availableBillingPlans,
        },
      }),
    ),
    shareReplay({ bufferSize: 1, refCount: true }),
  )

  readonly capabilities = toSignal(this.clientConfig$.pipe(map(toAuthCapabilities)), {
    initialValue: this.fallbackCapabilities,
  })

  signUpAvailable() {
    return this.clientConfig().pipe(map((config) => config.auth.signUpAvailable))
  }

  clientConfig() {
    return this.clientConfig$
  }
}

function toAuthCapabilities(config: ClientConfigResponse): AuthCapabilities {
  return {
    deploymentMode: config.deploymentMode,
    isCloud: config.deploymentMode === 'cloud',
    appPublicUrl: config.appPublicUrl,
    emailPassword: config.auth.emailPassword,
    google: config.auth.google,
    enterpriseSso: config.auth.enterpriseSso,
    externalProviders: config.auth.google || config.auth.enterpriseSso,
    signUpAvailable: config.auth.signUpAvailable,
    invitationEmailEnabled: config.mail.invitationEmailEnabled,
    availableBillingPlans: config.billing.availablePlans,
  }
}

function nextSixHourUtcWindow(now = new Date()): Date {
  const currentSlot = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), Math.floor(now.getUTCHours() / 6) * 6))
  return currentSlot.getTime() >= now.getTime() ? currentSlot : addHours(currentSlot, 6)
}
