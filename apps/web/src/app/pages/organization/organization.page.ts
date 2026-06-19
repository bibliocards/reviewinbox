import { Component, computed, inject } from '@angular/core'
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router'
import { AuthCapabilitiesService } from '../../shared/services/auth-capabilities.service'

@Component({
  selector: 'ri-organization-page',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './organization.page.html',
})
export class OrganizationPageComponent {
  private readonly capabilities = inject(AuthCapabilitiesService).capabilities

  protected readonly tabs = computed(() => [
    { label: 'Profile', route: 'profile' },
    { label: 'Members', route: 'members' },
    { label: 'Billing', route: 'billing', visible: this.capabilities.isCloud },
  ])
}
