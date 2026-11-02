import type { HttpErrorResponse } from '@angular/common/http'
import { Injectable, inject, signal } from '@angular/core'
import { TranslocoService } from '@jsverse/transloco'
import type { QueueReplyDraftResponse, ReplyInboxReview } from '@reviewinbox/contracts'
import { saveReplyDraftRequestSchema, storeReplyCharacterLimits } from '@reviewinbox/contracts'
import { DialogService } from 'primeng/dynamicdialog'
import { finalize, forkJoin, Subject, type Observable } from 'rxjs'
import { z } from 'zod'

import { AnalysisService } from '../../shared/services/analysis.service'
import { ReplyInboxService } from '../../shared/services/reply-inbox.service'
import {
  ReviewClassificationDialogComponent,
  type ReviewClassificationDialogResult,
} from '../analysis/review-classification-dialog.component'
import {
  RegenerateReplyDraftDialogComponent,
  type RegenerateReplyDraftDialogResult,
} from './components/regenerate-reply-draft-dialog.component'
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

@Injectable()
export class ReviewActionsService {
  private readonly replyInboxService = inject(ReplyInboxService)
  private readonly analysisService = inject(AnalysisService)
  private readonly dialogService = inject(DialogService)
  private readonly transloco = inject(TranslocoService)
  private readonly changes = new Subject<void>()
  readonly changes$ = this.changes.asObservable()
  private readonly draftEdits = signal<Record<string, ReplyDraftEdit>>({})
  readonly activeReviewId = signal<string | null>(null)
  readonly pendingActionKey = signal<string | null>(null)
  readonly activeClassificationReviewId = signal<string | null>(null)
  readonly message = signal<{ status: 'success' | 'error'; key: string } | null>(null)
  draftText(review: ReplyInboxReview): string {
    return this.draftEdits()[review.id]?.text ?? review.replyDraft?.draftText ?? ''
  }

  editDraft(review: ReplyInboxReview, text: string): void {
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

  hasDraftEdit(review: ReplyInboxReview): boolean {
    return this.draftEdits()[review.id] !== undefined
  }

  resetDraft(review: ReplyInboxReview): void {
    this.draftEdits.update((edits) => {
      const next = { ...edits }
      delete next[review.id]
      return next
    })
  }

  draftIsStale(review: ReplyInboxReview): boolean {
    const edit = this.draftEdits()[review.id]
    return edit !== undefined && edit.reviewContentToken !== review.reviewContentToken
  }

  canSaveDraft(review: ReplyInboxReview): boolean {
    return (
      !this.draftIsStale(review)
      && saveReplyDraftRequestSchema.safeParse({
        draftText: this.draftText(review),
        reviewContentToken: review.reviewContentToken,
      }).success
    )
  }

  replyLimit(review: ReplyInboxReview): number {
    return storeReplyCharacterLimits[review.provider]
  }

  saveDraft(review: ReplyInboxReview): void {
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

  queueDraft(review: ReplyInboxReview): void {
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

  publish(review: ReplyInboxReview): void {
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

  ignore(review: ReplyInboxReview): void {
    this.runAction(
      review.id,
      this.replyInboxService.ignoreReview(review.id, {
        reviewContentToken: review.reviewContentToken,
      }),
      'replyInbox.messages.ignored',
    )
  }

  unignore(review: ReplyInboxReview): void {
    this.runAction(
      review.id,
      this.replyInboxService.unignoreReview(review.id, {
        reviewContentToken: review.reviewContentToken,
      }),
      'replyInbox.messages.unignored',
    )
  }

  openDraftDialog(review: ReplyInboxReview): void {
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

  openRegenerateDraftDialog(review: ReplyInboxReview): void {
    if (!this.hasCurrentDraft(review) || !this.canSaveDraft(review)) {
      return
    }
    const dialog = this.dialogService.open(RegenerateReplyDraftDialogComponent, {
      header: this.transloco.translate('replyInbox.regeneration.title'),
      modal: true,
      closable: true,
      dismissableMask: true,
      width: 'min(640px, 94vw)',
      data: {
        reviewId: review.id,
        reviewContentToken: review.reviewContentToken,
        draftText: this.draftText(review),
      },
    })
    dialog?.onClose.subscribe((result?: RegenerateReplyDraftDialogResult) => {
      if (!result) {
        return
      }
      if ('reviewChanged' in result) {
        this.message.set({ status: 'error', key: 'replyInbox.messages.reviewChanged' })
        this.reload()
        return
      }
      this.editDraft(review, result.draftText)
    })
  }

  openClassificationEditor(review: ReplyInboxReview): void {
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

  hasCurrentDraft(review: ReplyInboxReview): boolean {
    return review.replyStatus === 'drafted' && review.replyDraft !== null
  }

  initialDraftText(review: ReplyInboxReview): string {
    if (this.hasCurrentDraft(review) && review.replyDraft !== null) {
      return review.replyDraft.draftText
    }

    return review.changedAfterReply ? (review.publishedReply?.replyText ?? '') : ''
  }

  private reload(): void {
    this.changes.next()
  }

  resetForOrganization(): void {
    this.draftEdits.set({})
    this.activeReviewId.set(null)
    this.pendingActionKey.set(null)
    this.message.set(null)
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
