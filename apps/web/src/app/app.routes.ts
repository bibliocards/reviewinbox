import type { Routes } from '@angular/router'
import { canActivate, redirectLoggedInTo, redirectUnauthorizedTo } from 'ngx-better-auth'
import { AppShellComponent } from './layout/app-shell.component'
import { AppsPageComponent } from './pages/apps/apps.page'
import { ReplyInboxPageComponent } from './pages/reply-inbox/reply-inbox.page'
import { signUpAvailableGuard } from './shared/guards/sign-up-available.guard'

export const appRoutes: Routes = [
  {
    path: 'login',
    title: 'Log in | ReviewInbox',
    loadComponent: () => import('./pages/auth/login/login.page').then((page) => page.LoginPageComponent),
    ...canActivate(redirectLoggedInTo(['/'])),
  },
  {
    path: 'sign-up',
    title: 'Create account | ReviewInbox',
    loadComponent: () => import('./pages/auth/sign-up/sign-up.page').then((page) => page.SignUpPageComponent),
    canActivate: [...canActivate(redirectLoggedInTo(['/'])).canActivate, signUpAvailableGuard],
  },
  {
    path: 'accept-invitation/:invitationId',
    title: 'Accept invitation | ReviewInbox',
    loadComponent: () => import('./pages/accept-invitation/accept-invitation.page').then((page) => page.AcceptInvitationPageComponent),
  },
  {
    path: '',
    component: AppShellComponent,
    ...canActivate(redirectUnauthorizedTo(['/login'])),
    children: [
      {
        path: '',
        title: 'Reply Inbox | ReviewInbox',
        component: ReplyInboxPageComponent,
      },
      {
        path: 'apps',
        title: 'Apps | ReviewInbox',
        component: AppsPageComponent,
      },
      {
        path: 'audit-history',
        title: 'Audit History | ReviewInbox',
        loadComponent: () => import('./pages/audit-history/audit-history.page').then((page) => page.AuditHistoryPageComponent),
      },
      {
        path: 'settings',
        title: 'Settings | ReviewInbox',
        loadComponent: () => import('./pages/settings/settings.page').then((page) => page.SettingsPageComponent),
      },
      {
        path: 'organization',
        loadChildren: () => import('./pages/organization/organization.routes').then((routes) => routes.organizationRoutes),
      },
      {
        path: 'organizations/new',
        title: 'Create Organization | ReviewInbox',
        loadComponent: () => import('./pages/organizations-new/organizations-new.page').then((page) => page.OrganizationsNewPageComponent),
      },
    ],
  },
  {
    path: '**',
    redirectTo: '',
  },
]
