import { NgClass } from '@angular/common'
import {
  Component,
  computed,
  effect,
  HostListener,
  inject,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core'
import { FormsModule } from '@angular/forms'
import { RouterLink } from '@angular/router'
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco'
import type { QueueReplyDraftResponse, ReplyInboxReview } from '@reviewinbox/contracts'
import { formatDistanceToNow } from 'date-fns/formatDistanceToNow'
import { enUS, fr } from 'date-fns/locale'
import { ButtonModule } from 'primeng/button'
import { DialogService } from 'primeng/dynamicdialog'
import { SelectModule } from 'primeng/select'
import { type Observable } from 'rxjs'

import {
  AppSelectComponent,
  type AppSelectOption,
} from '../../shared/components/app-select/app-select.component'
import { AppIconsService } from '../../shared/services/app-icons.service'
import { AppsService } from '../../shared/services/apps.service'
import { ReplyInboxService } from '../../shared/services/reply-inbox.service'
import {
  ReplyDraftDialogComponent,
  type ReplyDraftDialogData,
  type ReplyDraftDialogResult,
} from './components/reply-draft-dialog.component'

type ReplyInboxFilter = 'actionable' | ReplyInboxReview['replyStatus']

type SelectOption = AppSelectOption

const filterValues: readonly ReplyInboxFilter[] = [
  'actionable',
  'drafted',
  'failed',
  'pending',
  'ignored',
  'published',
]

@Component({
  selector: 'ri-reply-inbox-page',
  imports: [
    RouterLink,
    AppSelectComponent,
    ButtonModule,
    FormsModule,
    SelectModule,
    TranslocoDirective,
    NgClass,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './reply-inbox.page.html',
})
export class ReplyInboxPageComponent {
  private readonly appsService = inject(AppsService)
  private readonly replyInboxService = inject(ReplyInboxService)
  private readonly dialogService = inject(DialogService)
  private readonly transloco = inject(TranslocoService)
  private readonly appIcons = inject(AppIconsService)

  protected readonly selectedAppId = signal<string>('')
  protected readonly selectedFilter = signal<ReplyInboxFilter>('actionable')
  protected readonly activeReviewId = signal<string | null>(null)
  protected readonly message = signal<{ status: 'success' | 'error'; key: string } | null>(null)
  protected readonly appsResource = this.appsService.appsResource()
  protected readonly apps = computed(() =>
    this.appsResource.hasValue() ? this.appsResource.value().apps : [],
  )
  protected readonly appOptions = computed<SelectOption[]>(() => [
    { label: this.transloco.translate('replyInbox.filters.allApps'), value: '' },
    ...this.apps().map((app) => ({
      label: app.name,
      value: app.id,
      imageUrl: this.appIconUrl(app.id),
    })),
  ])
  protected readonly filterOptions = computed<SelectOption[]>(() =>
    filterValues.map((filter) => ({
      label: this.transloco.translate(this.filterLabelKey(filter)),
      value: filter,
    })),
  )
  protected readonly inboxResource = this.replyInboxService.replyInboxResource(() => ({
    filter: this.selectedFilter(),
    appId: this.selectedAppId(),
  }))
  protected readonly reviews = computed(() =>
    this.inboxResource.hasValue() ? this.inboxResource.value().reviews : [],
  )

  constructor() {
    effect(() => {
      this.appIcons.loadIcons(this.apps())
    })
  }

  protected reload(): void {
    this.inboxResource.reload()
  }

  @HostListener('window:reviewinbox:active-organization-changed')
  protected reloadForActiveOrganization(): void {
    this.selectedAppId.set('')
    this.activeReviewId.set(null)
    this.message.set(null)
    this.appsResource.reload()
    this.inboxResource.reload()
  }

  protected queueDraft(review: ReplyInboxReview): void {
    this.runAction<QueueReplyDraftResponse>(
      review.id,
      this.replyInboxService.queueDraft(review.id),
      'replyInbox.messages.draftUnavailable',
      (response) =>
        response.queued
          ? { status: 'success', key: 'replyInbox.messages.draftQueued' }
          : { status: 'error', key: 'replyInbox.messages.draftUnavailable', reload: false },
    )
  }

  protected publish(review: ReplyInboxReview): void {
    const draft = review.replyDraft
    if (!this.hasCurrentDraft(review) || draft === null) {
      return
    }

    this.runAction(
      review.id,
      this.replyInboxService.publishReply(review.id, {
        replyDraftId: draft.id,
        replyDraftUpdatedAt: draft.updatedAt,
      }),
      review.changedAfterReply
        ? 'replyInbox.messages.updatedReplyPublished'
        : 'replyInbox.messages.published',
    )
  }

  protected ignore(review: ReplyInboxReview): void {
    this.runAction(
      review.id,
      this.replyInboxService.ignoreReview(review.id),
      'replyInbox.messages.ignored',
    )
  }

  protected unignore(review: ReplyInboxReview): void {
    this.runAction(
      review.id,
      this.replyInboxService.unignoreReview(review.id),
      'replyInbox.messages.unignored',
    )
  }

  protected openDraftDialog(review: ReplyInboxReview): void {
    const dialog = this.dialogService.open(ReplyDraftDialogComponent, {
      header: this.transloco.translate(this.draftDialogTitleKey(review)),
      modal: true,
      closable: true,
      dismissableMask: true,
      width: 'min(760px, 94vw)',
      data: { mode: this.draftDialogMode(review), draftText: this.initialDraftText(review) },
    })

    dialog?.onClose.subscribe((result?: ReplyDraftDialogResult) => {
      if (!result) {
        return
      }

      const request =
        result.action === 'save'
          ? this.replyInboxService.saveDraft(review.id, { draftText: result.draftText })
          : this.replyInboxService.publishReply(review.id, { draftText: result.draftText })
      const successKey = this.draftActionSuccessKey(review, result.action)
      this.runAction(review.id, request, successKey)
    })
  }

  protected reviewedAgo(review: ReplyInboxReview): string {
    const activeLang = this.transloco.getActiveLang()
    const distance = formatDistanceToNow(review.reviewedAt, {
      locale: activeLang === 'fr' ? fr : enUS,
    })
    return this.transloco.translate('replyInbox.reviewedAgo', { distance })
  }

  protected isFromAppStore(review: ReplyInboxReview): boolean {
    return review.provider === 'apple_app_store'
  }

  protected providerLabel(review: ReplyInboxReview): string {
    return this.transloco.translate(
      this.isFromAppStore(review) ? 'apps.stores.apple' : 'apps.stores.google',
    )
  }

  protected appIconUrl(appId: string): string | null {
    return this.appIcons.iconUrl(appId)
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

  protected hasCurrentDraft(review: ReplyInboxReview): boolean {
    return review.replyStatus === 'drafted' && review.replyDraft !== null
  }

  protected isChangedAfterReply(review: ReplyInboxReview): boolean {
    return review.changedAfterReply
  }

  protected initialDraftText(review: ReplyInboxReview): string {
    if (this.hasCurrentDraft(review) && review.replyDraft !== null) {
      return review.replyDraft.draftText
    }

    return review.changedAfterReply ? (review.publishedReply?.replyText ?? '') : ''
  }

  protected reviewTitle(title: string | null): string {
    return title === null || title === ''
      ? this.transloco.translate('replyInbox.untitledReview')
      : title
  }

  protected ratingLabel(rating: number): string {
    return this.transloco.translate('replyInbox.rating', { rating })
  }

  protected statusClass(status: ReplyInboxReview['replyStatus']): string {
    const base = 'inline-flex rounded-full border px-2.5 py-1 text-xs font-medium'
    const classes: Record<ReplyInboxReview['replyStatus'], string> = {
      pending: 'border-blue-500/30 bg-blue-500/10 text-blue-700',
      drafted: 'border-green-500/30 bg-green-500/10 text-green-700',
      failed: 'border-red-500/30 bg-red-500/10 text-red-700',
      ignored: 'border-hairline bg-surface-2 text-ink-subtle',
      published: 'border-purple-500/30 bg-purple-500/10 text-purple-700',
    }
    return `${base} ${classes[status]}`
  }

  private filterLabelKey(filter: ReplyInboxFilter): string {
    return filter === 'actionable' ? 'replyInbox.filters.actionable' : `replyInbox.status.${filter}`
  }

  private draftDialogMode(review: ReplyInboxReview): ReplyDraftDialogData['mode'] {
    if (this.hasCurrentDraft(review)) {
      return review.changedAfterReply ? 'update' : 'edit'
    }

    return review.changedAfterReply ? 'update-manual' : 'manual'
  }

  private draftDialogTitleKey(review: ReplyInboxReview): string {
    if (this.hasCurrentDraft(review)) {
      return review.changedAfterReply
        ? 'replyInbox.dialog.updateTitle'
        : 'replyInbox.dialog.editTitle'
    }

    return review.changedAfterReply
      ? 'replyInbox.dialog.updateManualTitle'
      : 'replyInbox.dialog.manualTitle'
  }

  private draftActionSuccessKey(
    review: ReplyInboxReview,
    action: ReplyDraftDialogResult['action'],
  ): string {
    if (action === 'save') {
      return 'replyInbox.messages.draftSaved'
    }

    return review.changedAfterReply
      ? 'replyInbox.messages.updatedReplyPublished'
      : 'replyInbox.messages.published'
  }

  private runAction<T>(
    reviewId: string,
    request: Observable<T>,
    resultKey: string,
    resolveResult?: (value: T) => ActionResult,
  ): void {
    if (this.activeReviewId() !== null) {
      return
    }

    this.activeReviewId.set(reviewId)
    request.subscribe({
      next: (value) => {
        let actionResult: ActionResult
        if (resolveResult === undefined) {
          actionResult = { status: 'success', key: resultKey }
        } else {
          actionResult = resolveResult(value)
        }
        this.message.set({ status: actionResult.status, key: actionResult.key })
        if (actionResult.reload !== false) {
          this.reload()
        }
      },
      error: () => {
        this.message.set({ status: 'error', key: 'replyInbox.messages.actionFailed' })
      },
      complete: () => {
        this.activeReviewId.set(null)
      },
    })
  }
}

type ActionResult = { status: 'success' | 'error'; key: string; reload?: boolean }
