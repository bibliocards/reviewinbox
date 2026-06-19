import { Component, computed, effect, inject, signal } from '@angular/core'
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
  exact?: boolean
  visible?: boolean
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

  private readonly session = this.authService.session
  private readonly selectedOrganizationId = signal<string | undefined>(undefined)
  private readonly sessionActiveOrganizationId = computed(
    () => (this.session()?.session as { activeOrganizationId?: string } | undefined)?.activeOrganizationId,
  )
  private readonly didInitializeActiveOrganization = signal(false)
  private readonly loadedActiveMemberOrganizationId = signal<string | undefined>(undefined)
  private readonly activeMemberRole = signal<string | string[] | undefined>(undefined)
  protected readonly ownerInitials = computed(() => this.initialsFrom(this.session()?.user?.name))
  protected readonly organizations = this.organizationService.organizationsResource()
  protected readonly organizationList = computed(() => {
    if (this.organizations.error()) {
      return []
    }

    return this.organizations.value() ?? []
  })
  protected readonly activeOrganizationId = computed(
    () => this.selectedOrganizationId() ?? this.sessionActiveOrganizationId() ?? this.organizationList()[0]?.id,
  )
  protected readonly canManageOrganization = computed(() => {
    const role = this.roleLabel(this.activeMemberRole()).toLowerCase()
    return ['owner', 'admin'].includes(role)
  })

  protected readonly ownerMenuItems: MenuItem[] = [
    {
      label: 'Account settings',
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

  protected readonly navItems = computed<ShellNavItem[]>(() => [
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
      label: 'Organization',
      route: '/organization',
      icon: 'pi-users',
      exact: false,
      visible: this.canManageOrganization(),
    },
  ])

  constructor() {
    effect(() => {
      const organizationId = this.activeOrganizationId()

      if (this.didInitializeActiveOrganization() || this.sessionActiveOrganizationId() || !organizationId) {
        if (organizationId && this.loadedActiveMemberOrganizationId() !== organizationId) {
          this.loadActiveMember(organizationId)
        }

        return
      }

      this.didInitializeActiveOrganization.set(true)
      this.selectedOrganizationId.set(organizationId)
      this.loadedActiveMemberOrganizationId.set(organizationId)
      this.organizationService.setActive({ organizationId }).subscribe({
        next: () => this.loadActiveMember(organizationId),
        error: () => this.activeMemberRole.set(undefined),
      })
    })
  }

  protected switchOrganization(event: SelectChangeEvent): void {
    const organizationId = event.value as string | undefined

    if (!organizationId || organizationId === this.activeOrganizationId()) {
      return
    }

    this.selectedOrganizationId.set(organizationId)
    this.loadedActiveMemberOrganizationId.set(organizationId)
    this.organizationService.setActive({ organizationId }).subscribe({
      next: () => this.loadActiveMember(organizationId),
      error: () => this.activeMemberRole.set(undefined),
    })
  }

  private loadActiveMember(organizationId: string): void {
    this.loadedActiveMemberOrganizationId.set(organizationId)
    this.organizationService.getActiveMember().subscribe({
      next: (member) => this.activeMemberRole.set(member.role),
      error: () => this.activeMemberRole.set(undefined),
    })
  }

  private roleLabel(role: string | string[] | undefined): string {
    return Array.isArray(role) ? role.join(', ') : (role ?? 'member')
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
