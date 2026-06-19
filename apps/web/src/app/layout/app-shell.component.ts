import { Component, computed, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router'
import { AuthService, OrganizationService } from 'ngx-better-auth'
import type { MenuItem } from 'primeng/api'
import { ButtonModule } from 'primeng/button'
import { MenuModule } from 'primeng/menu'
import { type SelectChangeEvent, SelectModule } from 'primeng/select'
import { ThemeToggleComponent } from '../shared/components/theme-toggle/theme-toggle.component'

type ShellNavItem = {
  label: string
  route: string
  icon: string
}

@Component({
  selector: 'ri-app-shell',
  imports: [ButtonModule, RouterLink, RouterLinkActive, RouterOutlet, SelectModule, ThemeToggleComponent, FormsModule, MenuModule],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.css',
})
export class AppShellComponent {
  private readonly authService = inject(AuthService)
  private readonly organizationService = inject(OrganizationService)
  private readonly router = inject(Router)
  private readonly selectedOrganizationId = signal<string | undefined>(undefined)

  private readonly session = this.authService.session
  protected readonly ownerInitials = computed(() => this.initialsFrom(this.session()?.user?.name))
  protected readonly organizations = this.organizationService.organizationsResource().value
  protected readonly activeOrganizationId = computed(() => this.selectedOrganizationId() ?? this.organizations()?.[0]?.id)

  protected readonly ownerMenuItems: MenuItem[] = [
    {
      label: 'Settings',
      icon: 'pi pi-cog',
      routerLink: ['/settings'],
    },
    {
      separator: true,
    },
    {
      label: 'Log out',
      icon: 'pi pi-power-off',
      command: () => this.logout(),
    },
  ]

  protected readonly navItems: ShellNavItem[] = [
    {
      label: 'Reply Inbox',
      route: '/',
      icon: 'pi-inbox',
    },
    {
      label: 'Apps',
      route: '/apps',
      icon: 'pi-mobile',
    },
    {
      label: 'Settings',
      route: '/settings',
      icon: 'pi-cog',
    },
  ]

  protected switchOrganization(event: SelectChangeEvent): void {
    const organizationId = event.value as string | undefined

    if (!organizationId || organizationId === this.activeOrganizationId()) {
      return
    }

    this.selectedOrganizationId.set(organizationId)
    this.organizationService.setActive({ organizationId }).subscribe()
  }

  private logout(): void {
    this.authService.signOut().subscribe({
      next: () => void this.router.navigate(['/login']),
    })
  }

  protected initialsFrom(name: string): string {
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase()
  }
}
