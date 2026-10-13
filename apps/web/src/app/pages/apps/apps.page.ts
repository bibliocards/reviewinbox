import { HttpErrorResponse } from '@angular/common/http'
import {
  Component,
  computed,
  effect,
  HostListener,
  inject,
  linkedSignal,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { RouterLink } from '@angular/router'
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco'
import type {
  AppListItemResponse,
  ConnectAppResponse,
  OrganizationUsageResponse,
  StoreConnectionResponse,
  StoreProvider,
  SyncRunResponse,
  UpdateAppResponse,
} from '@reviewinbox/contracts'
import { syncRunResponseSchema } from '@reviewinbox/contracts'
import { formatDistanceToNow } from 'date-fns/formatDistanceToNow'
import { enUS, fr } from 'date-fns/locale'
import { OrganizationService } from 'ngx-better-auth'
import type { MenuItem } from 'primeng/api'
import { ButtonModule } from 'primeng/button'
import { CardModule } from 'primeng/card'
import { DialogService, type DynamicDialogConfig } from 'primeng/dynamicdialog'
import { MenuModule } from 'primeng/menu'
import { z } from 'zod'

import { badgeClasses } from '../../shared/badge-classes'
import { ConnectAppDialogComponent } from '../../shared/components/connect-app-dialog/connect-app-dialog.component'
import { AppIconsService } from '../../shared/services/app-icons.service'
import { AppsService } from '../../shared/services/apps.service'
import { OrganizationProfileService } from '../../shared/services/organization-profile.service'

type ReplyDraftQueueMessage = {
  key: string
  params?: Record<string, number>
  status: 'success' | 'error'
}

type InitialSyncStatus = 'not_requested' | 'queued' | 'partial' | 'failed'

const appNavigationStateSchema = z.object({
  appCreated: z.string().optional(),
  initialSyncStatus: z.enum(['not_requested', 'queued', 'partial', 'failed']).optional(),
})
const appNavigationState = appNavigationStateSchema.safeParse(history.state).data

@Component({
  selector: 'ri-apps-page',
  imports: [ButtonModule, CardModule, MenuModule, RouterLink, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './apps.page.html',
})
export class AppsPageComponent {
  private readonly appsService = inject(AppsService)
  private readonly dialogService = inject(DialogService)
  private readonly transloco = inject(TranslocoService)
  private readonly organizationService = inject(OrganizationService)
  private readonly organizationProfile = inject(OrganizationProfileService)
  private readonly appIcons = inject(AppIconsService)
  private readonly activeLanguage = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  })

  protected readonly appsResource = this.appsService.appsResource()
  protected readonly organizationUsageResource = this.organizationProfile.usageResource()
  protected readonly apps = linkedSignal<
    { loading: boolean; apps: AppListItemResponse[] },
    AppListItemResponse[]
  >({
    source: () => ({
      loading: this.appsResource.isLoading(),
      apps: this.appsResource.hasValue() ? this.appsResource.value().apps : [],
    }),
    computation: (current, previous) => (current.loading ? (previous?.value ?? []) : current.apps),
  })
  protected readonly stores = [
    { provider: 'apple_app_store', labelKey: 'apps.stores.apple', icon: 'pi-apple' },
    { provider: 'google_play', labelKey: 'apps.stores.google', icon: 'pi-google' },
  ] as const
  protected readonly cardTokens = {
    root: { borderRadius: '16px' },
    body: { padding: '0', gap: '0' },
  }
  protected readonly appMenus = computed(() => {
    this.activeLanguage()
    return new Map(this.apps().map((app) => [app.id, this.appMenuItems(app)]))
  })
  protected readonly appLimit = computed(() => {
    const usage = this.organizationUsageResource.hasValue()
      ? this.organizationUsageResource.value()
      : null
    return usage?.limitsEnforced === true ? usage.usage.apps.limit : null
  })
  protected readonly errorMessage = computed(() => this.appsResource.error())
  protected readonly successAppName = signal<string | null>(appNavigationState?.appCreated ?? null)
  protected readonly successMessageKey = signal<string | null>(null)
  protected readonly initialSyncStatus = signal<InitialSyncStatus | null>(
    appNavigationState?.initialSyncStatus ?? null,
  )
  protected readonly activeMemberRole = signal<string | string[] | null>(null)
  protected readonly syncingStoreConnectionId = signal<string | null>(null)
  protected readonly syncRunByStoreConnectionId = signal<Record<string, SyncRunResponse>>({})
  protected readonly queueingReplyDraftsAppId = signal<string | null>(null)
  protected readonly replyDraftQueueMessageByAppId = signal<Record<string, ReplyDraftQueueMessage>>(
    {},
  )
  protected readonly canManageApps = computed(() => {
    const role = this.roleLabel(this.activeMemberRole()).toLowerCase()
    return ['owner', 'admin'].includes(role)
  })
  protected readonly canEditReplySettings = computed(
    () => this.roleLabel(this.activeMemberRole()).toLowerCase() === 'owner',
  )
  protected readonly manualSyncAvailable = computed(() =>
    isManualSyncAvailable(
      this.organizationUsageResource.hasValue()
        ? this.organizationUsageResource.value()
        : undefined,
    ),
  )

  constructor() {
    this.loadActiveMemberRole()

    effect(() => {
      this.appIcons.loadIcons(this.apps())
    })
  }

  @HostListener('window:reviewinbox:apps-changed')
  protected reloadApps(): void {
    this.appsResource.reload()
  }

  @HostListener('window:reviewinbox:active-organization-changed')
  protected reloadForActiveOrganization(): void {
    this.apps.set([])
    this.successAppName.set(null)
    this.successMessageKey.set(null)
    this.initialSyncStatus.set(null)
    this.syncingStoreConnectionId.set(null)
    this.syncRunByStoreConnectionId.set({})
    this.queueingReplyDraftsAppId.set(null)
    this.replyDraftQueueMessageByAppId.set({})
    this.appsResource.reload()
    this.organizationUsageResource.reload()
    this.loadActiveMemberRole()
  }

  protected openConnectAppDialog(): void {
    const dialog = this.openAppDialog('apps.connectDialog.title')

    dialog?.onClose.subscribe((result?: ConnectAppResponse) => {
      if (!result) {
        return
      }

      this.initialSyncStatus.set(this.initialSyncStatusFrom(result))
      this.successAppName.set(result.app.name)
      this.successMessageKey.set(null)
      this.reloadApps()
    })
  }

  protected openEditAppDialog(app: AppListItemResponse): void {
    const dialog = this.openAppDialog('apps.connectDialog.editTitle', { app })

    dialog?.onClose.subscribe((result?: UpdateAppResponse) => {
      if (!result) {
        return
      }

      this.initialSyncStatus.set(this.initialSyncStatusFrom(result))
      this.successAppName.set(result.app.name)
      this.successMessageKey.set('apps.list.updatedSuccess')
      this.reloadApps()
    })
  }

  protected deleteApp(app: AppListItemResponse): void {
    const confirmed = confirm(
      this.transloco.translate('apps.list.deleteConfirm', { name: app.name }),
    )
    if (!confirmed) {
      return
    }

    this.appsService.deleteApp(app.id).subscribe({
      next: () => {
        this.successAppName.set(app.name)
        this.successMessageKey.set('apps.list.deletedSuccess')
        this.initialSyncStatus.set(null)
        this.reloadApps()
      },
      error: () => {
        this.successAppName.set(null)
        this.successMessageKey.set('apps.list.errors.deleteFailed')
      },
    })
  }

  protected syncStoreReviews(app: AppListItemResponse, provider: StoreProvider): void {
    this.syncReviews(this.storeConnection(app, provider))
  }

  protected queueMissingReplyDrafts(app: AppListItemResponse): void {
    if (!app.autoDraftEnabled || this.queueingReplyDraftsAppId() !== null) {
      return
    }

    this.queueingReplyDraftsAppId.set(app.id)
    this.appsService.queueMissingReplyDrafts(app.id).subscribe({
      next: (result) => {
        this.setReplyDraftQueueMessage(app.id, {
          key: 'apps.list.replyDrafts.queued',
          params: { queuedCount: result.queuedCount, skippedCount: result.skippedCount },
          status: 'success',
        })
      },
      error: () => {
        this.setReplyDraftQueueMessage(app.id, {
          key: 'apps.list.replyDrafts.errors.queueFailed',
          status: 'error',
        })
      },
      complete: () => {
        this.queueingReplyDraftsAppId.set(null)
      },
    })
  }

  private syncReviews(connection: StoreConnectionResponse | null): void {
    if (connection === null || this.syncingStoreConnectionId() !== null) {
      return
    }

    this.syncingStoreConnectionId.set(connection.id)
    this.appsService.syncStoreConnectionReviews(connection.id).subscribe({
      next: (syncRun) => {
        this.setSyncRunResult(syncRun)
      },
      error: (error: HttpErrorResponse) => {
        this.setSyncRunResult(syncRunFromError(error, connection.id))
      },
      complete: () => {
        this.syncingStoreConnectionId.set(null)
      },
    })
  }

  protected isStoreConfigured(app: AppListItemResponse, provider: StoreProvider): boolean {
    return this.storeConnection(app, provider) !== null
  }

  protected connectionForStore(app: AppListItemResponse, provider: StoreProvider) {
    return app.storeConnections.find((connection) => connection.provider === provider) ?? null
  }

  protected canManuallySync(app: AppListItemResponse, provider: StoreProvider): boolean {
    return this.manualSyncAvailable() && this.storeConnection(app, provider) !== null
  }

  protected isQueueingReplyDrafts(app: AppListItemResponse): boolean {
    return this.queueingReplyDraftsAppId() === app.id
  }

  protected replyDraftQueueMessage(app: AppListItemResponse): ReplyDraftQueueMessage | null {
    return this.replyDraftQueueMessageByAppId()[app.id] ?? null
  }

  protected mutationMessageKey(): string {
    const initialSyncStatus = this.initialSyncStatus()
    if (initialSyncStatus === 'failed') {
      return 'apps.list.initialSync.failed'
    }
    if (initialSyncStatus === 'partial') {
      return 'apps.list.initialSync.partial'
    }

    return this.successMessageKey() ?? 'apps.list.createdSuccess'
  }

  protected mutationMessageIsError(): boolean {
    const status = this.initialSyncStatus()
    return status === 'failed' || status === 'partial'
  }

  protected syncRunMessageKey(syncRun: Pick<SyncRunResponse, 'status' | 'errorCode'>): string {
    if (syncRun.status === 'succeeded') {
      return 'apps.list.sync.succeeded'
    }

    if (syncRun.status === 'partial') {
      return syncRunErrorMessageKeys.get(syncRun.errorCode ?? '') ?? 'apps.list.sync.partial'
    }

    return syncRunErrorMessageKeys.get(syncRun.errorCode ?? '') ?? 'apps.list.sync.failed'
  }

  protected storeStatusClass(app: AppListItemResponse, provider: StoreProvider): string {
    if (this.connectionForStore(app, provider)?.status === 'disabled') {
      return badgeClasses('ignored')
    }
    return badgeClasses(this.isStoreConfigured(app, provider) ? 'connected' : 'metadata')
  }

  protected createdAgo(createdAt: string): string {
    const activeLang = this.transloco.getActiveLang()
    const distance = formatDistanceToNow(createdAt, { locale: activeLang === 'fr' ? fr : enUS })
    return this.transloco.translate('apps.list.createdAgo', { distance })
  }

  protected syncRunDate(date: string): string {
    return new Intl.DateTimeFormat(this.transloco.getActiveLang(), {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(date))
  }

  protected appIconUrl(app: AppListItemResponse): string | null {
    return this.appIcons.iconUrl(app.id)
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

  private storeConnection(
    app: AppListItemResponse,
    provider: StoreProvider,
  ): StoreConnectionResponse | null {
    return (
      app.storeConnections.find(
        (connection) =>
          connection.provider === provider
          && connection.status === 'active'
          && connection.credential.hasCredential,
      ) ?? null
    )
  }

  protected isSyncingStore(app: AppListItemResponse, provider: StoreProvider): boolean {
    const connection = this.storeConnection(app, provider)
    return connection !== null && this.syncingStoreConnectionId() === connection.id
  }

  protected syncRunForStore(
    app: AppListItemResponse,
    provider: StoreProvider,
  ): SyncRunResponse | null {
    const connection = this.storeConnection(app, provider)
    return connection ? (this.syncRunByStoreConnectionId()[connection.id] ?? null) : null
  }

  private roleLabel(role: string | string[] | null): string {
    return Array.isArray(role) ? role.join(', ') : (role ?? 'member')
  }

  private loadActiveMemberRole(): void {
    this.organizationService.getActiveMember().subscribe({
      next: (member) => {
        this.activeMemberRole.set(member.role)
      },
      error: () => {
        this.activeMemberRole.set(null)
      },
    })
  }

  private openAppDialog(headerKey: string, data?: { app: AppListItemResponse }) {
    const dialogConfig: DynamicDialogConfig<{ app: AppListItemResponse }> = {
      header: this.transloco.translate(headerKey),
      modal: true,
      closable: true,
      dismissableMask: true,
      width: 'min(920px, 94vw)',
      contentStyle: { overflow: 'auto' },
      breakpoints: { '640px': '94vw' },
    }
    if (data) {
      dialogConfig.data = data
    }
    return this.dialogService.open(ConnectAppDialogComponent, dialogConfig)
  }

  private setSyncRunResult(syncRun: SyncRunResponse): void {
    this.syncRunByStoreConnectionId.update((results) => ({
      ...results,
      [syncRun.storeConnectionId]: syncRun,
    }))
    this.syncingStoreConnectionId.set(null)
    this.reloadApps()
  }

  private appMenuItems(app: AppListItemResponse): MenuItem[] {
    return [
      {
        label: this.transloco.translate('apps.actions.edit'),
        icon: 'pi pi-pencil',
        command: () => {
          this.openEditAppDialog(app)
        },
      },
      {
        label: this.transloco.translate('apps.actions.delete'),
        icon: 'pi pi-trash',
        command: () => {
          this.deleteApp(app)
        },
      },
    ]
  }

  private setReplyDraftQueueMessage(appId: string, message: ReplyDraftQueueMessage): void {
    this.replyDraftQueueMessageByAppId.update((messages) => ({ ...messages, [appId]: message }))
    this.queueingReplyDraftsAppId.set(null)
  }

  private initialSyncStatusFrom(result: ConnectAppResponse): InitialSyncStatus | null {
    return result.initialSync?.status ?? null
  }
}

function isManualSyncAvailable(usage: OrganizationUsageResponse | undefined): boolean {
  return usage?.limitsEnforced !== true || usage?.planName !== 'free'
}

const syncRunErrorMessageKeys = new Map<string, string>(
  Object.entries({
    apple_auth_failed: 'apps.list.sync.errors.appleAuthFailed',
    apple_forbidden: 'apps.list.sync.errors.appleForbidden',
    apple_invalid_response: 'apps.list.sync.errors.appleUnavailable',
    apple_not_found: 'apps.list.sync.errors.appleNotFound',
    apple_rate_limited: 'apps.list.sync.errors.appleRateLimited',
    apple_unavailable: 'apps.list.sync.errors.appleUnavailable',
    google_auth_failed: 'apps.list.sync.errors.googleAuthFailed',
    google_forbidden: 'apps.list.sync.errors.googleForbidden',
    google_invalid_response: 'apps.list.sync.errors.googleUnavailable',
    google_not_found: 'apps.list.sync.errors.googleNotFound',
    google_rate_limited: 'apps.list.sync.errors.googleRateLimited',
    google_unavailable: 'apps.list.sync.errors.googleUnavailable',
    invalid_credential_format: 'apps.list.sync.errors.invalidCredentialFormat',
    invalid_google_credential_format: 'apps.list.sync.errors.invalidGoogleCredentialFormat',
    missing_credential: 'apps.list.sync.errors.missingCredential',
    missing_external_app_id: 'apps.list.sync.errors.missingExternalAppId',
    monthly_review_import_cap_reached: 'apps.list.sync.errors.monthlyReviewImportCapReached',
    store_connection_disabled: 'apps.list.sync.errors.storeConnectionDisabled',
    unsupported_store_provider: 'apps.list.sync.errors.unsupportedStoreProvider',
  }),
)

function syncRunFromError(error: HttpErrorResponse, storeConnectionId: string): SyncRunResponse {
  const parsed = syncRunResponseSchema.safeParse(error.error)
  if (parsed.success) {
    return parsed.data
  }

  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    organizationId: '',
    appId: '00000000-0000-0000-0000-000000000000',
    storeConnectionId,
    status: 'failed',
    startedAt: null,
    finishedAt: now,
    fetchedCount: 0,
    storedCount: 0,
    errorCode: 'sync_failed',
    errorMessage: null,
    checkpoint: null,
    createdAt: now,
    updatedAt: now,
  }
}
