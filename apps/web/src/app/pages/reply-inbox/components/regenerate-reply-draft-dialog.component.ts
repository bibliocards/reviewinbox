import type { HttpErrorResponse } from '@angular/common/http'
import {
  Component,
  DestroyRef,
  HostListener,
  inject,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { TranslocoDirective } from '@jsverse/transloco'
import type { ReplyDraftAdjustment } from '@reviewinbox/contracts'
import { ButtonModule } from 'primeng/button'
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog'
import { SelectButtonModule } from 'primeng/selectbutton'
import { TextareaModule } from 'primeng/textarea'
import { finalize } from 'rxjs'
import { z } from 'zod'

import { AuthCapabilitiesService } from '../../../shared/services/auth-capabilities.service'
import { ReplyInboxService } from '../../../shared/services/reply-inbox.service'

export type RegenerateReplyDraftDialogData = {
  reviewId: string
  reviewContentToken: string
  draftText: string
}
export type RegenerateReplyDraftDialogResult = { draftText: string } | { reviewChanged: true }

const regenerationErrorSchema = z.object({ error: z.object({ errorCode: z.string() }) })

@Component({
  selector: 'ri-regenerate-reply-draft-dialog',
  imports: [ButtonModule, FormsModule, SelectButtonModule, TextareaModule, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './regenerate-reply-draft-dialog.component.html',
})
export class RegenerateReplyDraftDialogComponent {
  private readonly ref = inject(DynamicDialogRef)
  private readonly config =
    inject<DynamicDialogConfig<RegenerateReplyDraftDialogData>>(DynamicDialogConfig)
  private readonly replyInbox = inject(ReplyInboxService)
  private readonly destroyRef = inject(DestroyRef)
  protected readonly capabilities = inject(AuthCapabilitiesService)
  private readonly data = this.config.data
  protected readonly adjustments = signal<ReplyDraftAdjustment[]>([])
  protected readonly instructions = signal('')
  protected readonly isGenerating = signal(false)
  protected readonly proposal = signal<string | null>(null)
  protected readonly errorKey = signal<string | null>(null)

  protected generate(): void {
    if (this.isGenerating() || this.data === undefined) {
      return
    }
    this.isGenerating.set(true)
    this.errorKey.set(null)
    this.replyInbox
      .regenerateDraft(this.data.reviewId, {
        draftText: this.data.draftText,
        reviewContentToken: this.data.reviewContentToken,
        adjustments: this.adjustments(),
        instructions: this.instructions(),
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isGenerating.set(false)
        }),
      )
      .subscribe({
        next: (response) => {
          this.proposal.set(response.draftText)
        },
        error: (error: HttpErrorResponse) => {
          const code = regenerationErrorSchema.safeParse(error).data?.error.errorCode
          if (code === 'review_changed') {
            this.ref.close({ reviewChanged: true } satisfies RegenerateReplyDraftDialogResult)
            return
          }
          this.errorKey.set(
            code === 'monthly_managed_ai_reply_draft_cap_reached'
              ? 'replyInbox.regeneration.quotaReached'
              : 'replyInbox.regeneration.failed',
          )
        },
      })
  }

  protected useProposal(): void {
    const draftText = this.proposal()
    if (draftText !== null && !this.isGenerating()) {
      this.ref.close({ draftText } satisfies RegenerateReplyDraftDialogResult)
    }
  }

  @HostListener('window:reviewinbox:active-organization-changed')
  protected cancel(): void {
    this.ref.close()
  }
}
