import { inject } from '@angular/core'
import type { ActivatedRouteSnapshot, Routes } from '@angular/router'
import { TranslocoService } from '@jsverse/transloco'
import { canActivate, redirectLoggedInTo, redirectUnauthorizedTo } from 'ngx-better-auth'
import { map, take } from 'rxjs'

import { AppShellComponent } from './layout/app-shell.component'
import { AppsPageComponent } from './pages/apps/apps.page'
import { ReplyInboxPageComponent } from './pages/reply-inbox/reply-inbox.page'
import { signUpAvailableGuard } from './shared/guards/sign-up-available.guard'

export const appRoutes: Routes = [
  {
    path: 'login',
    title: () => pageTitle('login'),
    loadComponent: () =>
      import('./pages/auth/login/login.page').then((page) => page.LoginPageComponent),
    ...canActivate(redirectLoggedInTo(['/'])),
  },
  {
    path: 'sign-up',
    title: () => pageTitle('signUp'),
    loadComponent: () =>
      import('./pages/auth/sign-up/sign-up.page').then((page) => page.SignUpPageComponent),
    canActivate: [...canActivate(redirectLoggedInTo(['/'])).canActivate, signUpAvailableGuard],
  },
  {
    path: 'forgot-password',
    title: () => pageTitle('forgotPassword'),
    loadComponent: () =>
      import('./pages/auth/forgot-password/forgot-password.page').then(
        (page) => page.ForgotPasswordPageComponent,
      ),
  },
  {
    path: 'reset-password',
    title: (route: ActivatedRouteSnapshot) =>
      pageTitle('resetPassword', route.queryParamMap.get('lang')),
    loadComponent: () =>
      import('./pages/auth/reset-password/reset-password.page').then(
        (page) => page.ResetPasswordPageComponent,
      ),
  },
  {
    path: 'accept-invitation/:invitationId',
    title: () => pageTitle('acceptInvitation'),
    loadComponent: () =>
      import('./pages/accept-invitation/accept-invitation.page').then(
        (page) => page.AcceptInvitationPageComponent,
      ),
  },
  {
    path: 'organizations/new',
    title: () => pageTitle('createOrganization'),
    loadComponent: () =>
      import('./pages/organizations-new/organizations-new.page').then(
        (page) => page.OrganizationsNewPageComponent,
      ),
    ...canActivate(redirectUnauthorizedTo(['/login'])),
  },
  {
    path: '',
    component: AppShellComponent,
    ...canActivate(redirectUnauthorizedTo(['/login'])),
    children: [
      { path: '', title: () => pageTitle('inbox'), component: ReplyInboxPageComponent },
      { path: 'apps', title: () => pageTitle('apps'), component: AppsPageComponent },
      {
        path: 'audit-history',
        title: () => pageTitle('auditHistory'),
        loadComponent: () =>
          import('./pages/audit-history/audit-history.page').then(
            (page) => page.AuditHistoryPageComponent,
          ),
      },
      {
        path: 'settings',
        title: () => pageTitle('settings'),
        loadComponent: () =>
          import('./pages/settings/settings.page').then((page) => page.SettingsPageComponent),
      },
      {
        path: 'organization',
        loadChildren: () =>
          import('./pages/organization/organization.routes').then(
            (routes) => routes.organizationRoutes,
          ),
      },
    ],
  },
  { path: '**', redirectTo: '' },
]

function pageTitle(key: string, language?: string | null) {
  const transloco = inject(TranslocoService)
  if (language === 'en' || language === 'fr') {
    transloco.setActiveLang(language)
  }
  return transloco.selectTranslate<string>(`pageTitles.${key}`).pipe(
    take(1),
    map((title) => `${title} | ReviewInbox`),
  )
}
