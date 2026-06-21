import { Component, computed, inject, signal } from '@angular/core'
import { FormField, form, required } from '@angular/forms/signals'
import { TranslocoDirective } from '@jsverse/transloco'
import { ButtonModule } from 'primeng/button'
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog'

export type ReplyDraftDialogData = {
  draftText: string
  mode: 'manual' | 'edit'
}

export type ReplyDraftDialogResult = {
  action: 'save' | 'publish'
  draftText: string
}

@Component({
  selector: 'ri-reply-draft-dialog',
  imports: [ButtonModule, FormField, TranslocoDirective],
  templateUrl: './reply-draft-dialog.component.html',
})
export class ReplyDraftDialogComponent {
  private readonly ref = inject(DynamicDialogRef)
  private readonly config = inject(DynamicDialogConfig)

  protected readonly data: ReplyDraftDialogData = this.config.data
  protected readonly canSubmit = computed(() => this.draftForm().valid() && this.draftForm().value().draftText.trim().length > 0)

  private readonly model = signal({
    draftText: this.data.draftText,
  })

  protected readonly draftForm = form(this.model, (schema) => {
    required(schema.draftText)
  })

  protected submit(action: ReplyDraftDialogResult['action']): void {
    if (!this.canSubmit()) {
      this.draftForm().markAsTouched()
      return
    }

    this.ref.close({ action, draftText: this.draftForm().value().draftText.trim() })
  }

  protected cancel(): void {
    this.ref.close()
  }
}
