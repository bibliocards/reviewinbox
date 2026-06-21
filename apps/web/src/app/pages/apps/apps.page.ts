import { HttpErrorResponse } from '@angular/common/http'
import { Component, computed, effect, HostListener, inject, signal } from '@angular/core'
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco'
import type {
  AppListItemResponse,
  ConnectAppResponse,
  StoreConnectionResponse,
  StoreProvider,
  SyncRunResponse,
  UpdateAppResponse,
} from '@reviewinbox/contracts'
import { formatDistanceToNow } from 'date-fns/formatDistanceToNow'
import { enUS, fr } from 'date-fns/locale'
import { OrganizationService } from 'ngx-better-auth'
import { ButtonModule } from 'primeng/button'
import { DialogService } from 'primeng/dynamicdialog'
import { TableModule } from 'primeng/table'
import { ConnectAppDialogComponent } from '../../shared/components/connect-app-dialog/connect-app-dialog.component'
import { AppIconsService } from '../../shared/services/app-icons.service'
import { AppsService } from '../../shared/services/apps.service'

type ReplyDraftQueueMessage = {
  key: string
  params?: Record<string, number>
  status: 'success' | 'error'
}

@Component({
  selector: 'ri-apps-page',
  imports: [ButtonModule, TableModule, TranslocoDirective],
  templateUrl: './apps.page.html',
})
export class AppsPageComponent {
  private readonly appsService = inject(AppsService)
  private readonly dialogService = inject(DialogService)
  private readonly transloco = inject(TranslocoService)
  private readonly organizationService = inject(OrganizationService)
  private readonly appIcons = inject(AppIconsService)

  protected readonly appsResource = this.appsService.appsResource()
  protected readonly apps = computed(() => this.appsResource.value().apps)
  protected readonly errorMessage = computed(() => this.appsResource.error())
  protected readonly successAppName = signal<string | null>(history.state?.appCreated ?? null)
  protected readonly successMessageKey = signal<string | null>(null)
  protected readonly activeMemberRole = signal<string | string[] | undefined>(undefined)
  protected readonly syncingStoreConnectionId = signal<string | null>(null)
  protected readonly syncRunByStoreConnectionId = signal<Record<string, SyncRunResponse>>({})
  protected readonly queueingReplyDraftsAppId = signal<string | null>(null)
  protected readonly replyDraftQueueMessageByAppId = signal<Record<string, ReplyDraftQueueMessage>>({})
  protected readonly canManageApps = computed(() => {
    const role = this.roleLabel(this.activeMemberRole()).toLowerCase()
    return ['owner', 'admin'].includes(role)
  })

  constructor() {
    this.organizationService.getActiveMember().subscribe({
      next: (member) => this.activeMemberRole.set(member.role),
      error: () => this.activeMemberRole.set(undefined),
    })

    effect(() => {
      this.appIcons.loadIcons(this.apps())
    })
  }

  @HostListener('window:reviewinbox:apps-changed')
  protected reloadApps(): void {
    this.appsResource.reload()
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

      this.successAppName.set(result.app.name)
      this.successMessageKey.set(null)
      this.reloadApps()
    })
  }

  protected openEditAppDialog(app: AppListItemResponse): void {
    const dialog = this.dialogService.open(ConnectAppDialogComponent, {
      header: this.transloco.translate('apps.connectDialog.editTitle'),
      modal: true,
      closable: true,
      dismissableMask: true,
      width: 'min(920px, 94vw)',
      contentStyle: { overflow: 'auto' },
      data: { app },
      breakpoints: {
        '640px': '94vw',
      },
    })

    dialog?.onClose.subscribe((result?: UpdateAppResponse) => {
      if (!result) {
        return
      }

      this.successAppName.set(result.app.name)
      this.successMessageKey.set('apps.list.updatedSuccess')
      this.reloadApps()
    })
  }

  protected deleteApp(app: AppListItemResponse): void {
    const confirmed = confirm(this.transloco.translate('apps.list.deleteConfirm', { name: app.name }))
    if (!confirmed) {
      return
    }

    this.appsService.deleteApp(app.id).subscribe({
      next: () => {
        this.successAppName.set(app.name)
        this.successMessageKey.set('apps.list.deletedSuccess')
        this.reloadApps()
      },
      error: () => {
        this.successAppName.set(null)
        this.successMessageKey.set('apps.list.errors.deleteFailed')
      },
    })
  }

  protected syncAppleReviews(app: AppListItemResponse): void {
    this.syncReviews(this.appleStoreConnection(app))
  }

  protected syncGoogleReviews(app: AppListItemResponse): void {
    this.syncReviews(this.googleStoreConnection(app))
  }

  protected queueMissingReplyDrafts(app: AppListItemResponse): void {
    if (!app.autoDraftEnabled || this.queueingReplyDraftsAppId()) {
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
        this.setReplyDraftQueueMessage(app.id, { key: 'apps.list.replyDrafts.errors.queueFailed', status: 'error' })
      },
      complete: () => this.queueingReplyDraftsAppId.set(null),
    })
  }

  private syncReviews(connection: StoreConnectionResponse | null): void {
    if (!connection || this.syncingStoreConnectionId()) {
      return
    }

    this.syncingStoreConnectionId.set(connection.id)
    this.appsService.syncStoreConnectionReviews(connection.id).subscribe({
      next: (syncRun) => this.setSyncRunResult(syncRun),
      error: (error: unknown) => this.setSyncRunResult(syncRunFromError(error, connection.id)),
      complete: () => this.syncingStoreConnectionId.set(null),
    })
  }

  protected isStoreConfigured(app: AppListItemResponse, provider: StoreProvider): boolean {
    return app.storeConnections.some(
      (connection) => connection.provider === provider && connection.status === 'active' && connection.credential.hasCredential,
    )
  }

  protected appleStoreConnection(app: AppListItemResponse): StoreConnectionResponse | null {
    return (
      app.storeConnections.find(
        (connection) => connection.provider === 'apple_app_store' && connection.status === 'active' && connection.credential.hasCredential,
      ) ?? null
    )
  }

  protected googleStoreConnection(app: AppListItemResponse): StoreConnectionResponse | null {
    return (
      app.storeConnections.find(
        (connection) => connection.provider === 'google_play' && connection.status === 'active' && connection.credential.hasCredential,
      ) ?? null
    )
  }

  protected isSyncingApple(app: AppListItemResponse): boolean {
    const connection = this.appleStoreConnection(app)
    return connection != null && this.syncingStoreConnectionId() === connection.id
  }

  protected isSyncingGoogle(app: AppListItemResponse): boolean {
    const connection = this.googleStoreConnection(app)
    return connection != null && this.syncingStoreConnectionId() === connection.id
  }

  protected isQueueingReplyDrafts(app: AppListItemResponse): boolean {
    return this.queueingReplyDraftsAppId() === app.id
  }

  protected replyDraftQueueMessage(app: AppListItemResponse): ReplyDraftQueueMessage | null {
    return this.replyDraftQueueMessageByAppId()[app.id] ?? null
  }

  protected syncRunForApple(app: AppListItemResponse): SyncRunResponse | null {
    const connection = this.appleStoreConnection(app)
    return connection ? (this.syncRunByStoreConnectionId()[connection.id] ?? null) : null
  }

  protected syncRunForGoogle(app: AppListItemResponse): SyncRunResponse | null {
    const connection = this.googleStoreConnection(app)
    return connection ? (this.syncRunByStoreConnectionId()[connection.id] ?? null) : null
  }

  protected syncRunMessageKey(syncRun: SyncRunResponse): string {
    if (syncRun.status === 'succeeded') {
      return 'apps.list.sync.succeeded'
    }

    return syncRunErrorMessageKeys[syncRun.errorCode ?? ''] ?? 'apps.list.sync.failed'
  }

  protected storeStatusClass(app: AppListItemResponse, provider: StoreProvider): string {
    const base = 'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium'
    return this.isStoreConfigured(app, provider)
      ? `${base} border-green-500/40 bg-green-500/10 text-green-700`
      : `${base} border-hairline-strong bg-surface-2 text-ink-tertiary`
  }

  protected createdAgo(createdAt: string): string {
    const activeLang = this.transloco.getActiveLang()
    const distance = formatDistanceToNow(createdAt, { locale: activeLang === 'fr' ? fr : enUS })
    return this.transloco.translate('apps.list.createdAgo', { distance })
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

  private roleLabel(role: string | string[] | undefined): string {
    return Array.isArray(role) ? role.join(', ') : (role ?? 'member')
  }

  private setSyncRunResult(syncRun: SyncRunResponse): void {
    this.syncRunByStoreConnectionId.update((results) => ({
      ...results,
      [syncRun.storeConnectionId]: syncRun,
    }))
    this.syncingStoreConnectionId.set(null)
  }

  private setReplyDraftQueueMessage(appId: string, message: ReplyDraftQueueMessage): void {
    this.replyDraftQueueMessageByAppId.update((messages) => ({
      ...messages,
      [appId]: message,
    }))
    this.queueingReplyDraftsAppId.set(null)
  }
}

const syncRunErrorMessageKeys: Record<string, string> = {
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
  store_connection_disabled: 'apps.list.sync.errors.storeConnectionDisabled',
  unsupported_store_provider: 'apps.list.sync.errors.unsupportedStoreProvider',
}

function syncRunFromError(error: unknown, storeConnectionId: string): SyncRunResponse {
  const body = error instanceof HttpErrorResponse ? error.error : null
  if (isSyncRunResponse(body)) {
    return body
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

function isSyncRunResponse(value: unknown): value is SyncRunResponse {
  return Boolean(value && typeof value === 'object' && (value as Partial<SyncRunResponse>).storeConnectionId)
}
