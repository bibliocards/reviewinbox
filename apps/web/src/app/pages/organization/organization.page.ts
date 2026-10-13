import { Component, computed, inject, ChangeDetectionStrategy } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { NavigationEnd, Router, RouterOutlet } from '@angular/router'
import { TranslocoDirective } from '@jsverse/transloco'
import { TabsModule } from 'primeng/tabs'
import { filter, map } from 'rxjs'

import { AuthCapabilitiesService } from '../../shared/services/auth-capabilities.service'

@Component({
  selector: 'ri-organization-page',
  imports: [RouterOutlet, TabsModule, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './organization.page.html',
})
export class OrganizationPageComponent {
  private readonly capabilities = inject(AuthCapabilitiesService).capabilities
  private readonly router = inject(Router)
  private readonly routeUrl = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  )
  protected readonly section = computed(
    () => this.routeUrl().split('?')[0]?.split('/').at(-1) ?? 'usage',
  )
  protected readonly tabs = computed(() => [
    { labelKey: 'organization.navigation.usage', route: 'usage' },
    { labelKey: 'organization.navigation.members', route: 'members' },
    { labelKey: 'organization.navigation.profile', route: 'profile' },
    {
      labelKey: 'organization.navigation.billing',
      route: 'billing',
      visible: this.capabilities().isCloud,
    },
  ])
  protected selectSection(value: string | number | undefined): void {
    if (this.tabs().some((tab) => tab.route === value && tab.visible !== false)) {
      void this.router.navigate(['/organization', value])
    }
  }
}
