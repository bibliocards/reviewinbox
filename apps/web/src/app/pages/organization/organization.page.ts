import { Component } from '@angular/core'
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router'

@Component({
  selector: 'ri-organization-page',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './organization.page.html',
})
export class OrganizationPageComponent {
  protected readonly tabs = [
    { label: 'Profile', route: 'profile' },
    { label: 'Members', route: 'members' },
    { label: 'Billing', route: 'billing' },
  ]
}
