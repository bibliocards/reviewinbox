import type { Routes } from '@angular/router'
import { canActivate, hasOrganizationRole } from 'ngx-better-auth'
import { OrganizationBillingPageComponent } from './pages/organization-billing/organization-billing.page'
import { OrganizationMembersPageComponent } from './pages/organization-members/organization-members.page'
import { OrganizationProfilePageComponent } from './pages/organization-profile/organization-profile.page'

export const organizationRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./organization.page').then((page) => page.OrganizationPageComponent),
    ...canActivate(hasOrganizationRole(['owner', 'admin'], ['/'])),
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'members',
      },
      {
        path: 'profile',
        title: 'Organization profile | ReviewInbox',
        component: OrganizationProfilePageComponent,
      },
      {
        path: 'members',
        title: 'Organization members | ReviewInbox',
        component: OrganizationMembersPageComponent,
      },
      {
        path: 'billing',
        title: 'Organization billing | ReviewInbox',
        component: OrganizationBillingPageComponent,
      },
    ],
  },
]
