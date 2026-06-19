import type { Routes } from '@angular/router'
import { canActivate, redirectLoggedInTo, redirectUnauthorizedTo } from 'ngx-better-auth'
import { AppShellComponent } from './layout/app-shell.component'
import { AppsPageComponent } from './pages/apps/apps.page'
import { LoginPageComponent } from './pages/auth/login/login.page'
import { SignUpPageComponent } from './pages/auth/sign-up/sign-up.page'
import { ReplyInboxPageComponent } from './pages/reply-inbox/reply-inbox.page'
import { SettingsPageComponent } from './pages/settings/settings.page'
import { signUpAvailableGuard } from './shared/guards/sign-up-available.guard'

export const appRoutes: Routes = [
  {
    path: 'login',
    title: 'Log in | ReviewInbox',
    component: LoginPageComponent,
    ...canActivate(redirectLoggedInTo(['/'])),
  },
  {
    path: 'sign-up',
    title: 'Create account | ReviewInbox',
    component: SignUpPageComponent,
    canActivate: [...canActivate(redirectLoggedInTo(['/'])).canActivate, signUpAvailableGuard],
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
        path: 'settings',
        title: 'Settings | ReviewInbox',
        component: SettingsPageComponent,
      },
    ],
  },
  {
    path: '**',
    redirectTo: '',
  },
]
