import { HttpErrorResponse } from '@angular/common/http'
import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { FormField, form, required } from '@angular/forms/signals'
import { TranslocoDirective } from '@jsverse/transloco'
import type { ReplySettingsResponse, UpdateReplySettingsRequest } from '@reviewinbox/contracts'
import {
  maxLanguageTagLength,
  maxMappedLanguages,
  maxReplyContextLength,
} from '@reviewinbox/contracts'
import { ButtonModule } from 'primeng/button'
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog'
import { InputTextModule } from 'primeng/inputtext'
import { finalize } from 'rxjs'

import { ReplySettingsService } from '../../services/reply-settings.service'

type ReplySettingsDialogData = { appId: string }

@Component({
  selector: 'ri-reply-settings-dialog',
  imports: [ButtonModule, FormField, FormsModule, InputTextModule, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './reply-settings-dialog.component.html',
})
export class ReplySettingsDialogComponent {
  private readonly replySettings = inject(ReplySettingsService)
  private readonly dialogRef = inject(DynamicDialogRef)
  private readonly dialogConfig =
    inject<DynamicDialogConfig<ReplySettingsDialogData>>(DynamicDialogConfig)
  private readonly appId = this.dialogConfig.data?.appId

  protected readonly maxReplyContextLength = maxReplyContextLength
  protected readonly maxLanguageTagLength = maxLanguageTagLength
  protected readonly maxMappedLanguages = maxMappedLanguages
  protected readonly isLoading = signal(true)
  protected readonly isLoaded = signal(false)
  protected readonly isSaving = signal(false)
  protected readonly errorMessageKey = signal<string | null>(null)

  private readonly model = signal({
    replyContext: '',
    defaultLanguage: 'en',
    mappedLanguagesText: '',
  })

  protected readonly settingsForm = form(this.model, (schema) => {
    required(schema.defaultLanguage)
  })

  constructor() {
    if (this.appId === undefined || this.appId === '') {
      this.isLoading.set(false)
      this.errorMessageKey.set('apps.replySettings.errors.loadFailed')
      return
    }

    this.replySettings
      .getReplySettings(this.appId)
      .pipe(
        finalize(() => {
          this.isLoading.set(false)
        }),
      )
      .subscribe({
        next: (settings) => {
          this.setSettings(settings)
        },
        error: () => {
          this.errorMessageKey.set('apps.replySettings.errors.loadFailed')
        },
      })
  }

  protected close(): void {
    this.dialogRef.close()
  }

  protected submit(event: Event): void {
    event.preventDefault()

    const appId = this.appId
    if (appId === undefined || appId === '' || !this.isLoaded() || this.isSaving()) {
      return
    }

    if (!this.validateForm()) {
      return
    }

    const request = this.toRequest()
    if (!request) {
      return
    }

    this.errorMessageKey.set(null)
    this.isSaving.set(true)
    this.saveReplySettings(appId, request)
  }

  private saveReplySettings(appId: string, request: UpdateReplySettingsRequest): void {
    this.replySettings
      .updateReplySettings(appId, request)
      .pipe(
        finalize(() => {
          this.isSaving.set(false)
        }),
      )
      .subscribe({
        next: (settings) => {
          this.dialogRef.close(settings)
        },
        error: (error: HttpErrorResponse) => {
          this.errorMessageKey.set(
            apiErrorMessageKey(error, 'apps.replySettings.errors.updateFailed'),
          )
        },
      })
  }

  private setSettings(settings: ReplySettingsResponse): void {
    this.model.set({
      replyContext: settings.replyContext,
      defaultLanguage: settings.defaultLanguage,
      mappedLanguagesText: settings.mappedLanguages.join('\n'),
    })
    this.isLoaded.set(true)
  }

  private validateForm(): boolean {
    if (this.settingsForm().valid()) {
      return true
    }

    this.settingsForm().markAsTouched()
    this.errorMessageKey.set('apps.replySettings.errors.defaultLanguageRequired')
    return false
  }

  private toRequest(): UpdateReplySettingsRequest | null {
    const value = this.settingsForm().value()
    const replyContext = value.replyContext.trim()
    const defaultLanguage = value.defaultLanguage.trim()
    const mappedLanguages = parseMappedLanguages(value.mappedLanguagesText)

    const validationError = replySettingsValidationError(
      replyContext,
      defaultLanguage,
      mappedLanguages,
    )
    if (validationError !== null) {
      this.errorMessageKey.set(validationError)
      return null
    }

    return { replyContext, defaultLanguage, mappedLanguages }
  }
}

function parseMappedLanguages(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[\n,]/u)
        .map((language) => language.trim())
        .filter(Boolean),
    ),
  ]
}

function replySettingsValidationError(
  replyContext: string,
  defaultLanguage: string,
  mappedLanguages: string[],
): string | null {
  if (defaultLanguage === '') {
    return 'apps.replySettings.errors.defaultLanguageRequired'
  }
  if (replyContext.length > maxReplyContextLength) {
    return 'apps.replySettings.errors.contextTooLong'
  }
  if (
    defaultLanguage.length > maxLanguageTagLength
    || mappedLanguages.some((language) => language.length > maxLanguageTagLength)
  ) {
    return 'apps.replySettings.errors.languageTooLong'
  }
  if (mappedLanguages.length > maxMappedLanguages) {
    return 'apps.replySettings.errors.tooManyMappedLanguages'
  }

  return null
}

function apiErrorMessageKey(error: HttpErrorResponse, fallback: string): string {
  if (error instanceof HttpErrorResponse && error.status === 403) {
    return 'apps.replySettings.errors.ownerRequired'
  }

  return fallback
}
