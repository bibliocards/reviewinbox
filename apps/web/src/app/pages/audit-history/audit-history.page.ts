import { JsonPipe } from '@angular/common'
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
import { FormsModule } from '@angular/forms'
import { RouterLink } from '@angular/router'
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco'
import type {
  ListReplyAuditEventResponse,
  ListReplyAuditEventsResponse,
} from '@reviewinbox/contracts'
import { format } from 'date-fns/format'
import { enUS, fr } from 'date-fns/locale'
import { ButtonModule } from 'primeng/button'
import { SelectModule } from 'primeng/select'
import { type TableLazyLoadEvent, TableModule } from 'primeng/table'
import { z } from 'zod'

import { badgeClasses } from '../../shared/badge-classes'
import {
  AppSelectComponent,
  type AppSelectOption,
} from '../../shared/components/app-select/app-select.component'
import { TypedTemplateDirective } from '../../shared/directives/typed-template.directive'
import { initialsFrom } from '../../shared/initials'
import { AppIconsService } from '../../shared/services/app-icons.service'
import { AppsService } from '../../shared/services/apps.service'
import { ReplyInboxService } from '../../shared/services/reply-inbox.service'

type ActionFilter = '' | ListReplyAuditEventResponse['action']
type SelectOption = AppSelectOption
const failureTextSchema = z.string().trim().min(1)

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
  imports: [
    AppSelectComponent,
    FormsModule,
    SelectModule,
    TableModule,
    TranslocoDirective,
    JsonPipe,
    TypedTemplateDirective,
    RouterLink,
    ButtonModule,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './audit-history.page.html',
})
export class AuditHistoryPageComponent {
  private readonly appsService = inject(AppsService)
  private readonly replyInboxService = inject(ReplyInboxService)
  private readonly transloco = inject(TranslocoService)
  private readonly appIcons = inject(AppIconsService)
  private readonly activeLanguage = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  })

  protected readonly pageSize = signal(100)
  protected readonly page = signal(1)
  protected readonly selectedAppId = signal('')
  protected readonly selectedAction = signal<ActionFilter>('')
  protected readonly appsResource = this.appsService.appsResource()
  protected readonly apps = computed(() =>
    this.appsResource.hasValue() ? this.appsResource.value().apps : [],
  )
  protected readonly appOptions = computed<SelectOption[]>(() => {
    this.activeLanguage()
    return [
      { label: this.transloco.translate('replyInbox.filters.allApps'), value: '' },
      ...this.apps().map((app) => ({
        label: app.name,
        value: app.id,
        imageUrl: this.appIcons.iconUrl(app.id),
      })),
    ]
  })
  protected readonly actionOptions = computed<SelectOption[]>(() => {
    this.activeLanguage()
    return [
      { label: this.transloco.translate('auditHistory.filters.allActions'), value: '' },
      ...actionValues.map((action) => ({
        label: this.transloco.translate(`auditHistory.actions.${action}`),
        value: action,
      })),
    ]
  })
  protected readonly auditResource = this.replyInboxService.replyAuditEventsResource(() => ({
    page: this.page(),
    pageSize: this.pageSize(),
    appId: this.selectedAppId(),
    action: this.selectedAction(),
  }))
  private readonly auditPage = linkedSignal<
    { loading: boolean; data: ListReplyAuditEventsResponse },
    ListReplyAuditEventsResponse
  >({
    source: () => ({
      loading: this.auditResource.isLoading(),
      data: this.auditResource.hasValue()
        ? this.auditResource.value()
        : { events: [], page: 1, pageSize: 100, total: 0 },
    }),
    computation: (current, previous) =>
      current.loading ? (previous?.value ?? current.data) : current.data,
  })
  protected readonly events = computed(() =>
    this.auditPage().events.map((event) =>
      Object.assign({}, event, { day: format(new Date(event.createdAt), 'yyyy-MM-dd') }),
    ),
  )
  protected readonly total = computed(() => this.auditPage().total)
  protected readonly first = computed(() => (this.page() - 1) * this.pageSize())
  protected readonly tableTokens = {
    headerCell: { padding: '12px 20px' },
    bodyCell: { padding: '12px 20px' },
  }

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
    this.auditPage.set({ events: [], page: 1, pageSize: 100, total: 0 })
    this.selectedAppId.set('')
    this.selectedAction.set('')
    this.page.set(1)
    this.appsResource.reload()
    this.auditResource.reload()
  }

  protected reviewLabel(event: ListReplyAuditEventResponse): string {
    if (event.reviewTitle !== null && event.reviewTitle !== '') {
      return event.reviewTitle
    }

    if (event.reviewAuthorDisplayName !== null && event.reviewAuthorDisplayName !== '') {
      return event.reviewAuthorDisplayName
    }

    return this.transloco.translate('replyInbox.untitledReview')
  }

  protected actorLabel(event: ListReplyAuditEventResponse): string {
    const split = event.actorName.trim().split(/\s+/u)
    return split.length > 1 ? `${split[0]} ${split.at(-1)?.slice(0, 1)}.` : event.actorName
  }

  protected appIconUrl(event: ListReplyAuditEventResponse): string | null {
    return this.appIcons.iconUrl(event.appId)
  }

  protected readonly initialsFrom = initialsFrom

  protected readonly actionClass = badgeClasses

  protected formattedCreatedAt(createdAt: string): string {
    return format(new Date(createdAt), 'HH:mm')
  }

  protected dayLabel(createdAt: string): string {
    const date = new Date(createdAt)
    if (format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')) {
      return this.transloco.translate('auditHistory.today')
    }
    const locale = this.transloco.getActiveLang() === 'fr' ? fr : enUS
    return format(date, 'PP', { locale })
  }

  protected failureReason(event: ListReplyAuditEventResponse): string {
    const message = failureTextSchema.safeParse(event.metadata?.['errorMessage'])
    if (message.success) {
      return message.data
    }
    const code = failureTextSchema.safeParse(event.metadata?.['errorCode'])
    return code.success ? code.data : this.transloco.translate('auditHistory.failureUnknown')
  }

  protected reloadAudit(): void {
    this.auditResource.reload()
  }
}
