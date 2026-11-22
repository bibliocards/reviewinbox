import { Component, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core'
import { FormField, form, required } from '@angular/forms/signals'
import { TranslocoDirective } from '@jsverse/transloco'
import { storeReplyCharacterLimits, type StoreProvider } from '@reviewinbox/contracts'
import { ButtonModule } from 'primeng/button'
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog'

export type ReplyDraftDialogData = {
  draftText: string
  provider: StoreProvider
  mode: 'manual' | 'edit' | 'update' | 'update-manual'
}

export type ReplyDraftDialogResult = { action: 'save' | 'publish'; draftText: string }

@Component({
  selector: 'ri-reply-draft-dialog',
  imports: [ButtonModule, FormField, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './reply-draft-dialog.component.html',
})
export class ReplyDraftDialogComponent {
  private readonly ref = inject(DynamicDialogRef)
  private readonly config = inject<DynamicDialogConfig<ReplyDraftDialogData>>(DynamicDialogConfig)

  protected readonly data: ReplyDraftDialogData = this.config.data ?? {
    draftText: '',
    provider: 'apple_app_store',
    mode: 'manual',
  }
  protected readonly replyLimit = storeReplyCharacterLimits[this.data.provider]
  protected readonly draftLength = computed(() => this.draftForm().value().draftText.trim().length)
  protected readonly exceedsReplyLimit = computed(() => this.draftLength() > this.replyLimit)
  protected readonly canSubmit = computed(() => this.draftForm().valid() && this.draftLength() > 0)

  private readonly model = signal({ draftText: this.data.draftText })

  protected readonly draftForm = form(this.model, (schema) => {
    required(schema.draftText)
  })

  protected isUpdate(): boolean {
    return this.data.mode === 'update' || this.data.mode === 'update-manual'
  }

  protected submit(action: ReplyDraftDialogResult['action']): void {
    if (!this.canSubmit() || (action === 'publish' && this.exceedsReplyLimit())) {
      this.draftForm().markAsTouched()
      return
    }

    this.ref.close({ action, draftText: this.draftForm().value().draftText.trim() })
  }

  protected cancel(): void {
    this.ref.close()
  }
}
