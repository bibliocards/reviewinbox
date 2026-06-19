import { inject } from '@angular/core'
import { type CanActivateFn, Router } from '@angular/router'
import { map } from 'rxjs'
import { AuthCapabilitiesService } from '../services/auth-capabilities.service'

export const signUpAvailableGuard: CanActivateFn = (route) => {
  const authCapabilities = inject(AuthCapabilitiesService)
  const router = inject(Router)

  if (route.queryParamMap.has('invitationId')) {
    return true
  }

  return authCapabilities
    .signUpAvailable()
    .pipe(map((isAvailable) => (isAvailable ? true : router.createUrlTree(['/login'], { queryParams: { signUp: 'disabled' } }))))
}
