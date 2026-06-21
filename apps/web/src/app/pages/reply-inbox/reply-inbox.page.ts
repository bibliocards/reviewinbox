import { NgClass } from '@angular/common'
import { Component, computed, effect, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco'
import type { ReplyInboxReview } from '@reviewinbox/contracts'
import { formatDistanceToNow } from 'date-fns/formatDistanceToNow'
import { enUS, fr } from 'date-fns/locale'
import { ButtonModule } from 'primeng/button'
import { DialogService } from 'primeng/dynamicdialog'
import { SelectModule } from 'primeng/select'
import { AppSelectComponent, type AppSelectOption } from '../../shared/components/app-select/app-select.component'
import { AppIconsService } from '../../shared/services/app-icons.service'
import { AppsService } from '../../shared/services/apps.service'
import { ReplyInboxService } from '../../shared/services/reply-inbox.service'
import { ReplyDraftDialogComponent, type ReplyDraftDialogResult } from './components/reply-draft-dialog.component'

type ReplyInboxFilter = 'actionable' | ReplyInboxReview['replyStatus']

type SelectOption = AppSelectOption

const filterValues: readonly ReplyInboxFilter[] = ['actionable', 'drafted', 'failed', 'pending', 'ignored', 'published']

@Component({
  selector: 'ri-reply-inbox-page',
  imports: [AppSelectComponent, ButtonModule, FormsModule, SelectModule, TranslocoDirective, NgClass],
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
  protected readonly apps = computed(() => this.appsResource.value().apps)
  protected readonly appOptions = computed<SelectOption[]>(() => [
    { label: this.transloco.translate('replyInbox.filters.allApps'), value: '' },
    ...this.apps().map((app) => ({ label: app.name, value: app.id, imageUrl: this.appIconUrl(app.id) })),
  ])
  protected readonly filterOptions = computed<SelectOption[]>(() =>
    filterValues.map((filter) => ({ label: this.transloco.translate(this.filterLabelKey(filter)), value: filter })),
  )
  protected readonly inboxResource = this.replyInboxService.replyInboxResource(() => ({
    filter: this.selectedFilter(),
    appId: this.selectedAppId(),
  }))
  protected readonly reviews = computed(() => this.inboxResource.value().reviews)

  constructor() {
    effect(() => {
      this.appIcons.loadIcons(this.apps())
    })
  }

  protected reload(): void {
    this.inboxResource.reload()
  }

  protected queueDraft(review: ReplyInboxReview): void {
    this.runAction(review.id, this.replyInboxService.queueDraft(review.id), 'replyInbox.messages.draftQueued')
  }

  protected publish(review: ReplyInboxReview): void {
    if (!review.replyDraft) {
      return
    }

    this.runAction(
      review.id,
      this.replyInboxService.publishReply(review.id, {
        replyDraftId: review.replyDraft.id,
        replyDraftUpdatedAt: review.replyDraft.updatedAt,
      }),
      'replyInbox.messages.published',
    )
  }

  protected ignore(review: ReplyInboxReview): void {
    this.runAction(review.id, this.replyInboxService.ignoreReview(review.id), 'replyInbox.messages.ignored')
  }

  protected unignore(review: ReplyInboxReview): void {
    this.runAction(review.id, this.replyInboxService.unignoreReview(review.id), 'replyInbox.messages.unignored')
  }

  protected openDraftDialog(review: ReplyInboxReview): void {
    const dialog = this.dialogService.open(ReplyDraftDialogComponent, {
      header: this.transloco.translate(review.replyDraft ? 'replyInbox.dialog.editTitle' : 'replyInbox.dialog.manualTitle'),
      modal: true,
      closable: true,
      dismissableMask: true,
      width: 'min(760px, 94vw)',
      data: {
        mode: review.replyDraft ? 'edit' : 'manual',
        draftText: review.replyDraft?.draftText ?? '',
      },
    })

    dialog?.onClose.subscribe((result?: ReplyDraftDialogResult) => {
      if (!result) {
        return
      }

      const request =
        result.action === 'save'
          ? this.replyInboxService.saveDraft(review.id, { draftText: result.draftText })
          : this.replyInboxService.publishReply(review.id, { draftText: result.draftText })
      const successKey = result.action === 'save' ? 'replyInbox.messages.draftSaved' : 'replyInbox.messages.published'
      this.runAction(review.id, request, successKey)
    })
  }

  protected reviewedAgo(review: ReplyInboxReview): string {
    const activeLang = this.transloco.getActiveLang()
    const distance = formatDistanceToNow(review.reviewedAt, { locale: activeLang === 'fr' ? fr : enUS })
    return this.transloco.translate('replyInbox.reviewedAgo', { distance })
  }

  protected isFromAppStore(review: ReplyInboxReview): boolean {
    return review.provider === 'apple_app_store'
  }

  protected providerLabel(review: ReplyInboxReview): string {
    return this.transloco.translate(this.isFromAppStore(review) ? 'apps.stores.apple' : 'apps.stores.google')
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

  private runAction(
    reviewId: string,
    request: { subscribe: (observer: { next?: () => void; error?: () => void; complete?: () => void }) => unknown },
    successKey: string,
  ): void {
    if (this.activeReviewId()) {
      return
    }

    this.activeReviewId.set(reviewId)
    request.subscribe({
      next: () => {
        this.message.set({ status: 'success', key: successKey })
        this.reload()
      },
      error: () => this.message.set({ status: 'error', key: 'replyInbox.messages.actionFailed' }),
      complete: () => this.activeReviewId.set(null),
    })
  }
}
