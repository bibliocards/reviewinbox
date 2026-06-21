import { JsonPipe } from '@angular/common'
import { Component, computed, effect, HostListener, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco'
import type { ListReplyAuditEventResponse } from '@reviewinbox/contracts'
import { format } from 'date-fns/format'
import { enUS, fr } from 'date-fns/locale'
import { SelectModule } from 'primeng/select'
import { type TableLazyLoadEvent, TableModule } from 'primeng/table'
import { AppSelectComponent, type AppSelectOption } from '../../shared/components/app-select/app-select.component'
import { TypedTemplateDirective } from '../../shared/directives/typed-template.directive'
import { AppIconsService } from '../../shared/services/app-icons.service'
import { AppsService } from '../../shared/services/apps.service'
import { ReplyInboxService } from '../../shared/services/reply-inbox.service'

type ActionFilter = '' | ListReplyAuditEventResponse['action']
type SelectOption = AppSelectOption

const actionValues: readonly ListReplyAuditEventResponse['action'][] = [
  'draft_created',
  'draft_edited',
  'ignored',
  'unignored',
  'publish_failed',
  'published',
]

@Component({
  selector: 'ri-audit-history-page',
  imports: [AppSelectComponent, FormsModule, SelectModule, TableModule, TranslocoDirective, JsonPipe, TypedTemplateDirective],
  templateUrl: './audit-history.page.html',
})
export class AuditHistoryPageComponent {
  private readonly appsService = inject(AppsService)
  private readonly replyInboxService = inject(ReplyInboxService)
  private readonly transloco = inject(TranslocoService)
  private readonly appIcons = inject(AppIconsService)

  protected readonly pageSize = signal(100)
  protected readonly page = signal(1)
  protected readonly selectedAppId = signal('')
  protected readonly selectedAction = signal<ActionFilter>('')
  protected readonly appsResource = this.appsService.appsResource()
  protected readonly apps = computed(() => this.appsResource.value().apps)
  protected readonly appOptions = computed<SelectOption[]>(() => [
    { label: this.transloco.translate('replyInbox.filters.allApps'), value: '' },
    ...this.apps().map((app) => ({ label: app.name, value: app.id, imageUrl: this.appIcons.iconUrl(app.id) })),
  ])
  protected readonly actionOptions = computed<SelectOption[]>(() => [
    { label: this.transloco.translate('auditHistory.filters.allActions'), value: '' },
    ...actionValues.map((action) => ({ label: this.transloco.translate(`auditHistory.actions.${action}`), value: action })),
  ])
  protected readonly auditResource = this.replyInboxService.replyAuditEventsResource(() => ({
    page: this.page(),
    pageSize: this.pageSize(),
    appId: this.selectedAppId(),
    action: this.selectedAction(),
  }))
  protected readonly events = computed(() => this.auditResource.value().events)
  protected readonly total = computed(() => this.auditResource.value().total)
  protected readonly first = computed(() => (this.page() - 1) * this.pageSize())

  constructor() {
    effect(() => {
      this.appIcons.loadIcons(this.apps())
    })
  }

  protected onPage(event: TableLazyLoadEvent): void {
    const rows = event.rows ?? 100
    this.pageSize.set(rows)
    this.page.set(Math.floor((event.first ?? 0) / rows) + 1)
  }

  protected resetPage(): void {
    this.page.set(1)
  }

  @HostListener('window:reviewinbox:active-organization-changed')
  protected reloadForActiveOrganization(): void {
    this.selectedAppId.set('')
    this.selectedAction.set('')
    this.page.set(1)
    this.appsResource.reload()
    this.auditResource.reload()
  }

  protected reviewLabel(event: ListReplyAuditEventResponse): string {
    return event.reviewTitle || event.reviewAuthorDisplayName || this.transloco.translate('replyInbox.untitledReview')
  }

  protected actorLabel(event: ListReplyAuditEventResponse): string {
    const split = event.actorName.split(' ')
    return `${split[0]} ${split[1]?.slice(0, 1)}`.trim()
  }

  protected appIconUrl(event: ListReplyAuditEventResponse): string | null {
    return this.appIcons.iconUrl(event.appId)
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

  protected actionClass(action: ListReplyAuditEventResponse['action']): string {
    const base = 'inline-flex whitespace-nowrap rounded-full border px-1.5 py-1 text-xs font-medium'
    const classes: Record<ListReplyAuditEventResponse['action'], string> = {
      draft_created: 'border-blue-500/30 bg-blue-500/10 text-blue-700',
      draft_edited: 'border-green-500/30 bg-green-500/10 text-green-700',
      ignored: 'border-hairline bg-surface-2 text-ink-subtle',
      unignored: 'border-amber-500/30 bg-amber-500/10 text-amber-700',
      publish_failed: 'border-red-500/30 bg-red-500/10 text-red-700',
      published: 'border-purple-500/30 bg-purple-500/10 text-purple-700',
    }
    return `${base} ${classes[action]}`
  }

  protected formattedCreatedAt(createdAt: string): string {
    const locale = this.transloco.getActiveLang() === 'fr' ? fr : enUS
    return format(new Date(createdAt), 'PP p', { locale })
  }
}
