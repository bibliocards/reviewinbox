import { ChangeDetectorRef, Component, computed, DestroyRef, effect, HostListener, inject, signal } from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationSkipped,
  NavigationStart,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router'
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco'
import type { ConnectAppResponse } from '@reviewinbox/contracts'
import { addHours } from 'date-fns'
import { AuthService, OrganizationService } from 'ngx-better-auth'
import type { MenuItem } from 'primeng/api'
import { ButtonModule } from 'primeng/button'
import { DialogService } from 'primeng/dynamicdialog'
import { MenuModule } from 'primeng/menu'
import { type SelectChangeEvent, SelectModule } from 'primeng/select'
import { ConnectAppDialogComponent } from '../shared/components/connect-app-dialog/connect-app-dialog.component'
import { ThemeToggleComponent } from '../shared/components/theme-toggle/theme-toggle.component'
import { TypedTemplateDirective } from '../shared/directives/typed-template.directive'
import { AuthCapabilitiesService } from '../shared/services/auth-capabilities.service'
import { OrganizationProfileService } from '../shared/services/organization-profile.service'

type ShellNavItem = {
  labelKey: string
  route: string
  icon: string
  exact?: boolean
  visible?: boolean
}

@Component({
  selector: 'ri-app-shell',
  imports: [
    ButtonModule,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    SelectModule,
    ThemeToggleComponent,
    FormsModule,
    MenuModule,
    TranslocoDirective,
    TypedTemplateDirective,
  ],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.css',
})
export class AppShellComponent {
  private readonly authService = inject(AuthService)
  private readonly organizationService = inject(OrganizationService)
  private readonly router = inject(Router)
  private readonly dialogService = inject(DialogService)
  private readonly transloco = inject(TranslocoService)
  private readonly authCapabilities = inject(AuthCapabilitiesService)
  private readonly organizationProfile = inject(OrganizationProfileService)
  private readonly changeDetector = inject(ChangeDetectorRef)
  private readonly capabilities = this.authCapabilities.capabilities
  private readonly destroyRef = inject(DestroyRef)

  private readonly session = this.authService.session
  private readonly selectedOrganizationId = signal<string | undefined>(undefined)
  private readonly organizationActivationTarget = signal<string | undefined>(undefined)
  private readonly sessionActiveOrganizationId = computed(
    () => (this.session()?.session as { activeOrganizationId?: string } | undefined)?.activeOrganizationId,
  )
  private readonly didInitializeActiveOrganization = signal(false)
  private readonly activeMemberRole = signal<string | string[] | undefined>(undefined)
  private readonly now = signal(new Date())
  private readonly clientConfig = toSignal(this.authCapabilities.clientConfig(), { initialValue: null })
  private readonly activeLanguage = toSignal(this.transloco.langChanges$, { initialValue: this.transloco.getActiveLang() })
  private readonly currentTranslation = toSignal(this.transloco.selectTranslation(), { initialValue: null })
  private readonly routeUrl = signal(this.router.url)
  private readonly committedRouteUrl = signal(this.router.url)
  protected readonly organizationReady = signal(false)
  protected readonly organizationError = signal(false)
  protected readonly previousReadyOrganizationId = signal<string | undefined>(undefined)
  protected readonly isChangingOrganization = signal(false)
  protected readonly organizationUsageResource = this.organizationProfile.usageResource(() => this.organizationReady())
  protected readonly ownerInitials = computed(() => this.initialsFrom(this.session()?.user?.name))
  protected readonly isCloud = computed(() => this.capabilities().isCloud)
  protected readonly organizations = this.organizationService.organizationsResource()
  protected readonly organizationList = computed(() => {
    if (this.organizations.error()) {
      return []
    }

    return this.organizations.value() ?? []
  })
  protected readonly activeOrganizationId = computed(
    () =>
      this.selectedOrganizationId() ??
      this.organizationList().find((organization) => organization.id === this.sessionActiveOrganizationId())?.id ??
      this.organizationList()[0]?.id,
  )
  protected readonly organizationSelectValue = computed(() =>
    this.organizationError() ? this.activeOrganizationId() : (this.organizationActivationTarget() ?? this.activeOrganizationId()),
  )
  protected readonly canManageOrganization = computed(() => {
    const role = this.roleLabel(this.activeMemberRole()).toLowerCase()
    return ['owner', 'admin'].includes(role)
  })
  protected readonly isUserScopedRoute = computed(() => {
    return this.isUserScopedUrl(this.routeUrl())
  })

  protected readonly ownerMenuItems = computed<MenuItem[]>(() => [
    {
      label: this.translate('shell.menu.accountSettings'),
      icon: 'pi pi-cog',
      routerLink: ['/settings'],
    },
    {
      label: this.translate('shell.menu.newOrganization'),
      icon: 'pi pi-plus',
      routerLink: ['/organizations/new'],
      visible: this.capabilities().isCloud,
    },
    {
      separator: true,
    },
    {
      label: this.translate('shell.menu.logout'),
      icon: 'pi pi-power-off',
      command: () => this.logout(),
    },
  ])

  protected readonly navItems = computed<ShellNavItem[]>(() => [
    {
      labelKey: 'shell.navigation.replyInbox',
      route: '/',
      icon: 'pi-inbox',
    },
    {
      labelKey: 'shell.navigation.apps',
      route: '/apps',
      icon: 'pi-mobile',
    },
    {
      labelKey: 'shell.navigation.auditHistory',
      route: '/audit-history',
      icon: 'pi-history',
    },
    {
      labelKey: 'shell.navigation.organization',
      route: '/organization',
      icon: 'pi-users',
      exact: false,
      visible: this.canManageOrganization(),
    },
  ])
  protected readonly autoSyncStatus = computed(() => {
    const autoSync = this.clientConfig()?.autoSync
    if (!autoSync?.reviewsEnabled) {
      return null
    }

    const usage = this.organizationUsageResource.hasValue() ? this.organizationUsageResource.value() : undefined
    if (usage?.limitsEnforced && usage.planName === 'free') {
      return {
        key: 'shell.autoSync.free',
      }
    }

    const nextWindow = this.nextWindowAfter(autoSync.nextWindowStartsAt, this.now())
    if (!nextWindow) {
      return null
    }

    return {
      key: 'shell.autoSync.nextWindow',
      params: {
        time: new Intl.DateTimeFormat(this.activeLanguage() || undefined, { hour: '2-digit', minute: '2-digit' }).format(nextWindow),
      },
    }
  })

  constructor() {
    const clock = setInterval(() => this.now.set(new Date()), 60_000)
    this.destroyRef.onDestroy(() => clearInterval(clock))

    this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      if (event instanceof NavigationStart) {
        if (this.isUserScopedUrl(event.url)) {
          // Wait until NavigationEnd before opening an outlet for Settings;
          // opening it now could mount the previous page context.
          return
        }

        // NavigationEnd is emitted after the destination outlet is activated. Close
        // the shell outlet immediately for Organization-scoped destinations so their
        // components cannot start resources before the Organization is ready.
        this.routeUrl.set(event.url)
        this.changeDetector.detectChanges()
        return
      }

      if (event instanceof NavigationEnd) {
        this.committedRouteUrl.set(event.urlAfterRedirects)
        this.routeUrl.set(event.urlAfterRedirects)
        return
      }

      if (event instanceof NavigationCancel || event instanceof NavigationError || event instanceof NavigationSkipped) {
        this.routeUrl.set(this.committedRouteUrl())
        this.changeDetector.detectChanges()
      }
    })

    effect(() => {
      if (this.didInitializeActiveOrganization() || this.organizations.isLoading() || this.organizations.error()) {
        return
      }

      const organizationId = this.activeOrganizationId()
      if (!organizationId) {
        return
      }

      this.didInitializeActiveOrganization.set(true)
      if (this.sessionActiveOrganizationId() === organizationId) {
        this.organizationReady.set(true)
        this.loadActiveMember()
      } else {
        this.activateOrganization(organizationId)
      }
    })
  }

  protected switchOrganization(event: SelectChangeEvent): void {
    const organizationId = event.value as string | undefined
    if (!organizationId || (organizationId === this.activeOrganizationId() && !this.organizationError()) || this.isChangingOrganization()) {
      return
    }

    this.activateOrganization(organizationId)
  }

  protected retryOrganization(): void {
    const organizationId = this.organizationActivationTarget() ?? this.activeOrganizationId()
    if (organizationId && this.organizationError()) {
      this.activateOrganization(organizationId)
    } else {
      this.organizations.reload()
    }
  }

  protected returnToPreviousOrganization(): void {
    const organizationId = this.previousReadyOrganizationId()
    if (organizationId && !this.isChangingOrganization()) {
      this.activateOrganization(organizationId)
    }
  }

  private activateOrganization(organizationId: string): void {
    if (this.organizationReady()) {
      this.previousReadyOrganizationId.set(this.activeOrganizationId())
    }
    this.organizationReady.set(false)
    this.organizationError.set(false)
    this.isChangingOrganization.set(true)
    this.activeMemberRole.set(undefined)
    this.organizationActivationTarget.set(organizationId)
    this.organizationService.setActive({ organizationId }).subscribe({
      next: () => {
        this.isChangingOrganization.set(false)
        this.selectedOrganizationId.set(organizationId)
        this.organizationActivationTarget.set(undefined)
        this.previousReadyOrganizationId.set(undefined)
        this.organizationReady.set(true)
        this.loadActiveMember()
        this.notifyActiveOrganizationChanged(organizationId)
      },
      error: () => {
        this.isChangingOrganization.set(false)
        this.organizationError.set(true)
      },
    })
  }

  @HostListener('window:reviewinbox:organizations-changed')
  protected reloadOrganizations(): void {
    this.organizations.reload()
  }

  protected openConnectAppDialog(): void {
    const dialog = this.dialogService.open(ConnectAppDialogComponent, {
      header: this.transloco.translate('apps.connectDialog.title'),
      modal: true,
      closable: true,
      dismissableMask: true,
      width: 'min(920px, 94vw)',
      contentStyle: { overflow: 'auto' },
      breakpoints: {
        '640px': '94vw',
      },
    })

    dialog?.onClose.subscribe((result?: ConnectAppResponse) => {
      if (!result) {
        return
      }

      dispatchEvent(new CustomEvent('reviewinbox:apps-changed'))
      void this.router.navigate(['/apps'], { state: { appCreated: result.app.name } })
    })
  }

  private loadActiveMember(): void {
    this.organizationService.getActiveMember().subscribe({
      next: (member) => this.activeMemberRole.set(member.role),
      error: () => this.activeMemberRole.set(undefined),
    })
  }

  private notifyActiveOrganizationChanged(organizationId: string): void {
    dispatchEvent(new CustomEvent('reviewinbox:active-organization-changed', { detail: { organizationId } }))
  }

  private translate(key: string): string {
    this.activeLanguage()
    this.currentTranslation()
    return this.transloco.translate(key)
  }

  private isUserScopedUrl(url: string): boolean {
    const primarySegments = this.router.parseUrl(url).root.children['primary']?.segments ?? []
    return primarySegments[0]?.path === 'settings'
  }

  private roleLabel(role: string | string[] | undefined): string {
    return Array.isArray(role) ? role.join(', ') : (role ?? 'member')
  }

  private logout(): void {
    this.authService.signOut().subscribe({
      next: () => void this.router.navigate(['/login']),
    })
  }

  protected initialsFrom(name: string | undefined): string {
    return (name ?? '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase()
  }

  private nextWindowAfter(firstWindowStartsAt: string, now: Date): Date | null {
    const next = new Date(firstWindowStartsAt)
    if (Number.isNaN(next.getTime())) {
      return null
    }

    while (next.getTime() <= now.getTime()) {
      next.setTime(addHours(next, 6).getTime())
    }

    return next
  }
}
