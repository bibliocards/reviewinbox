import { NgClass, NgTemplateOutlet } from '@angular/common'
import type { HttpErrorResponse } from '@angular/common/http'
import {
  Component,
  computed,
  effect,
  HostListener,
  inject,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { ActivatedRoute, RouterLink } from '@angular/router'
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco'
import type { QueueReplyDraftResponse, ReplyInboxReview } from '@reviewinbox/contracts'
import {
  replyInboxFilterSchema,
  saveReplyDraftRequestSchema,
  storeReplyCharacterLimits,
} from '@reviewinbox/contracts'
import { formatDistanceToNow } from 'date-fns/formatDistanceToNow'
import { enUS, fr } from 'date-fns/locale'
import { ButtonModule } from 'primeng/button'
import { DialogService } from 'primeng/dynamicdialog'
import { TabsModule } from 'primeng/tabs'
import { TextareaModule } from 'primeng/textarea'
import { catchError, finalize, forkJoin, of, switchMap, type Observable } from 'rxjs'
import { z } from 'zod'

import { badgeClasses } from '../../shared/badge-classes'
import {
  AppSelectComponent,
  type AppSelectOption,
} from '../../shared/components/app-select/app-select.component'
import { AnalysisService } from '../../shared/services/analysis.service'
import { AppIconsService } from '../../shared/services/app-icons.service'
import { AppsService } from '../../shared/services/apps.service'
import { ReplyInboxService } from '../../shared/services/reply-inbox.service'
import {
  ReviewClassificationDialogComponent,
  type ReviewClassificationDialogResult,
} from '../analysis/review-classification-dialog.component'
import {
  ReplyDraftDialogComponent,
  type ReplyDraftDialogData,
  type ReplyDraftDialogResult,
} from './components/reply-draft-dialog.component'
import { buildPublishRequest, type ReplyDraftEdit } from './reply-draft-edit'

const changedReviewErrorSchema = z.object({
  status: z.literal(409),
  error: z.object({ errorCode: z.literal('review_changed') }),
})

type ReplyInboxFilter = 'actionable' | ReplyInboxReview['replyStatus']

type SelectOption = AppSelectOption

const filterValues: readonly ReplyInboxFilter[] = [
  'actionable',
  'drafted',
  'published',
  'ignored',
  'failed',
  'pending',
]

@Component({
  selector: 'ri-reply-inbox-page',
  imports: [
    RouterLink,
    AppSelectComponent,
    ButtonModule,
    FormsModule,
    TabsModule,
    TextareaModule,
    NgTemplateOutlet,
    TranslocoDirective,
    NgClass,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './reply-inbox.page.html',
})
export class ReplyInboxPageComponent {
  private readonly route = inject(ActivatedRoute)
  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  })
  protected readonly selectedReviewId = computed(
    () => this.queryParams().get('reviewId') ?? undefined,
  )
  private readonly appsService = inject(AppsService)
  private readonly replyInboxService = inject(ReplyInboxService)
  private readonly analysisService = inject(AnalysisService)
  private readonly dialogService = inject(DialogService)
  private readonly transloco = inject(TranslocoService)
  private readonly appIcons = inject(AppIconsService)

  protected readonly selectedAppId = signal<string>('')
  protected readonly selectedFilter = signal<ReplyInboxFilter>('actionable')
  protected readonly activeReviewId = signal<string | null>(null)
  protected readonly pendingActionKey = signal<string | null>(null)
  protected readonly activeClassificationReviewId = signal<string | null>(null)
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
    appId: this.selectedReviewId() === undefined ? this.selectedAppId() : undefined,
    reviewId: this.selectedReviewId(),
  }))
  protected readonly reviews = computed(() =>
    this.inboxResource.hasValue() ? this.inboxResource.value().reviews : [],
  )

  protected readonly focusedReviewId = signal<string | null>(null)
  protected readonly focusedReview = computed(
    () =>
      this.reviews().find((review) => review.id === this.focusedReviewId())
      ?? this.reviews()[0]
      ?? null,
  )
  protected readonly classification = toSignal(
    toObservable(this.focusedReview).pipe(
      switchMap((review) =>
        review === null
          ? of(null)
          : this.analysisService.reviewAnalysis(review.id).pipe(catchError(() => of(null))),
      ),
    ),
    { initialValue: null },
  )
  private readonly draftEdits = signal<Record<string, ReplyDraftEdit>>({})

  protected selectFilter(value: string | number | undefined): void {
    const parsed = replyInboxFilterSchema.safeParse(value)
    if (parsed.success) {
      this.selectedFilter.set(parsed.data)
      this.focusedReviewId.set(null)
    }
  }

  protected draftText(review: ReplyInboxReview): string {
    return this.draftEdits()[review.id]?.text ?? review.replyDraft?.draftText ?? ''
  }

  protected editDraft(review: ReplyInboxReview, text: string): void {
    const previous = this.draftEdits()[review.id]
    if (text === review.replyDraft?.draftText && !this.draftIsStale(review)) {
      this.resetDraft(review)
      return
    }
    this.draftEdits.update((edits) => ({
      ...edits,
      [review.id]: {
        text,
        reviewContentToken: previous?.reviewContentToken ?? review.reviewContentToken,
      },
    }))
  }

  protected hasDraftEdit(review: ReplyInboxReview): boolean {
    return this.draftEdits()[review.id] !== undefined
  }

  protected resetDraft(review: ReplyInboxReview): void {
    this.draftEdits.update((edits) => {
      const next = { ...edits }
      delete next[review.id]
      return next
    })
  }

  protected draftIsStale(review: ReplyInboxReview): boolean {
    const edit = this.draftEdits()[review.id]
    return edit !== undefined && edit.reviewContentToken !== review.reviewContentToken
  }

  protected canSaveDraft(review: ReplyInboxReview): boolean {
    return (
      !this.draftIsStale(review)
      && saveReplyDraftRequestSchema.safeParse({
        draftText: this.draftText(review),
        reviewContentToken: review.reviewContentToken,
      }).success
    )
  }

  protected replyLimit(review: ReplyInboxReview): number {
    return storeReplyCharacterLimits[review.provider]
  }

  protected saveDraft(review: ReplyInboxReview): void {
    if (!this.hasCurrentDraft(review) || !this.canSaveDraft(review)) {
      return
    }
    const edit = this.draftEdits()[review.id]
    this.runAction(
      review.id,
      this.replyInboxService.saveDraft(review.id, {
        draftText: this.draftText(review).trim(),
        reviewContentToken: edit?.reviewContentToken ?? review.reviewContentToken,
      }),
      'replyInbox.messages.draftSaved',
      () => {
        this.resetDraft(review)
        return { status: 'success', key: 'replyInbox.messages.draftSaved' }
      },
    )
  }

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
    this.focusedReviewId.set(null)
    this.draftEdits.set({})
    this.activeReviewId.set(null)
    this.pendingActionKey.set(null)
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
    const input = buildPublishRequest(review, this.draftEdits()[review.id])
    if (
      input === null
      || !this.canSaveDraft(review)
      || this.draftText(review).trim().length > this.replyLimit(review)
    ) {
      return
    }
    const successKey = review.changedAfterReply
      ? 'replyInbox.messages.updatedReplyPublished'
      : 'replyInbox.messages.published'
    this.runAction(
      review.id,
      this.replyInboxService.publishReply(review.id, input),
      successKey,
      () => {
        this.resetDraft(review)
        return { status: 'success', key: successKey }
      },
    )
  }

  protected ignore(review: ReplyInboxReview): void {
    this.runAction(
      review.id,
      this.replyInboxService.ignoreReview(review.id, {
        reviewContentToken: review.reviewContentToken,
      }),
      'replyInbox.messages.ignored',
    )
  }

  protected unignore(review: ReplyInboxReview): void {
    this.runAction(
      review.id,
      this.replyInboxService.unignoreReview(review.id, {
        reviewContentToken: review.reviewContentToken,
      }),
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

      const input = { draftText: result.draftText, reviewContentToken: review.reviewContentToken }
      const request =
        result.action === 'save'
          ? this.replyInboxService.saveDraft(review.id, input)
          : this.replyInboxService.publishReply(review.id, input)
      const successKey = this.draftActionSuccessKey(review, result.action)
      this.runAction(review.id, request, successKey)
    })
  }

  protected openClassificationEditor(review: ReplyInboxReview): void {
    if (this.activeClassificationReviewId() !== null) {
      return
    }
    this.activeClassificationReviewId.set(review.id)
    forkJoin({
      analysis: this.analysisService.reviewAnalysis(review.id),
      topics: this.analysisService.topics(review.appId),
    }).subscribe({
      next: ({ analysis, topics }) => {
        const dialog = this.dialogService.open(ReviewClassificationDialogComponent, {
          header: this.transloco.translate('analysis.editor.title'),
          modal: true,
          closable: true,
          dismissableMask: true,
          width: 'min(720px, 94vw)',
          data: { review: analysis, topics: topics.topics },
        })
        dialog?.onClose.subscribe((result?: ReviewClassificationDialogResult) => {
          if (!result) {
            this.activeClassificationReviewId.set(null)
            return
          }
          this.saveClassification(review.id, result)
        })
        if (!dialog) {
          this.activeClassificationReviewId.set(null)
        }
      },
      error: () => {
        this.message.set({ status: 'error', key: 'analysis.messages.actionFailed' })
        this.activeClassificationReviewId.set(null)
      },
    })
  }

  private saveClassification(reviewId: string, result: ReviewClassificationDialogResult): void {
    const request =
      result.action === 'reset'
        ? this.analysisService.resetReviewClassification(reviewId)
        : this.analysisService.updateReviewClassification(reviewId, result)
    request.subscribe({
      next: () => {
        this.message.set({ status: 'success', key: 'analysis.messages.reviewSaved' })
        this.reload()
      },
      error: () => {
        this.message.set({ status: 'error', key: 'analysis.messages.actionFailed' })
        this.activeClassificationReviewId.set(null)
      },
      complete: () => {
        this.activeClassificationReviewId.set(null)
      },
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

  protected readonly statusClass = badgeClasses

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
    this.pendingActionKey.set(resultKey)
    request
      .pipe(
        finalize(() => {
          this.activeReviewId.set(null)
          this.pendingActionKey.set(null)
        }),
      )
      .subscribe({
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
        error: (error: HttpErrorResponse) => {
          const changed = changedReviewErrorSchema.safeParse(error).success
          this.message.set({
            status: 'error',
            key: changed ? 'replyInbox.messages.reviewChanged' : 'replyInbox.messages.actionFailed',
          })
          if (changed) {
            this.reload()
          }
        },
      })
  }
}

type ActionResult = { status: 'success' | 'error'; key: string; reload?: boolean }
