import { Injectable } from '@angular/core'
import { of } from 'rxjs'

export type AuthCapabilities = {
  emailPassword: boolean
  google: boolean
  enterpriseSso: boolean
  signUpAvailable: boolean
}

@Injectable({ providedIn: 'root' })
export class AuthCapabilitiesService {
  readonly capabilities: AuthCapabilities = {
    emailPassword: true,
    google: false,
    enterpriseSso: false,
    signUpAvailable: true,
  }

  signUpAvailable() {
    return of(this.capabilities.signUpAvailable)
  }
}
