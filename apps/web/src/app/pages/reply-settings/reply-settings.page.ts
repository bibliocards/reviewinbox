import { HttpErrorResponse } from '@angular/common/http'
import {
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { FormField, form, required } from '@angular/forms/signals'
import { ActivatedRoute, RouterLink } from '@angular/router'
import { TranslocoDirective } from '@jsverse/transloco'
import type { ReplySettingsResponse, UpdateReplySettingsRequest } from '@reviewinbox/contracts'
import {
  maxLanguageTagLength,
  maxMappedLanguages,
  maxReplyContextLength,
} from '@reviewinbox/contracts'
import { OrganizationService } from 'ngx-better-auth'
import { ButtonModule } from 'primeng/button'
import { InputTextModule } from 'primeng/inputtext'
import { SelectModule } from 'primeng/select'
import { TextareaModule } from 'primeng/textarea'
import { finalize, Subject, takeUntil } from 'rxjs'
import { z } from 'zod'

import { AppsService } from '../../shared/services/apps.service'
import { ReplySettingsService } from '../../shared/services/reply-settings.service'

@Component({
  selector: 'ri-reply-settings-page',
  imports: [
    ButtonModule,
    FormField,
    FormsModule,
    InputTextModule,
    TranslocoDirective,
    RouterLink,
    SelectModule,
    TextareaModule,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './reply-settings.page.html',
})
export class ReplySettingsPageComponent {
  private readonly replySettings = inject(ReplySettingsService)
  private readonly route = inject(ActivatedRoute)
  private readonly destroyRef = inject(DestroyRef)
  private readonly organizationService = inject(OrganizationService)
  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  })
  private readonly appId = computed(() => this.params().get('appId') ?? '')
  private readonly reloadVersion = signal(0)
  private readonly scopeChanged = new Subject<void>()
  private readonly appsResource = inject(AppsService).appsResource()
  protected readonly appName = computed(() =>
    this.appsResource.hasValue()
      ? this.appsResource.value().apps.find((app) => app.id === this.appId())?.name
      : undefined,
  )
  protected readonly canEdit = signal(false)
  protected readonly languageInput = signal('')
  protected readonly languages = computed(() =>
    parseMappedLanguages(this.model().mappedLanguagesText),
  )
  protected readonly defaultLanguageOptions = computed(() =>
    [
      ...new Set([
        this.model().defaultLanguage,
        'en',
        'fr',
        'es',
        'de',
        'it',
        'pt',
        'ja',
        'ko',
        'zh',
      ]),
    ].filter(Boolean),
  )
  protected readonly saved = signal(false)

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
    effect((onCleanup) => {
      this.reloadVersion()
      const appId = this.appId()
      this.resetForApp()
      const memberRequest = this.loadMember()
      const settingsRequest = this.loadSettings(appId)
      onCleanup(() => {
        this.scopeChanged.next()
        memberRequest.unsubscribe()
        settingsRequest?.unsubscribe()
      })
    })
  }

  private resetForApp(): void {
    this.model.set({ replyContext: '', defaultLanguage: 'en', mappedLanguagesText: '' })
    this.languageInput.set('')
    this.saved.set(false)
    this.isLoading.set(true)
    this.isLoaded.set(false)
    this.canEdit.set(false)
    this.errorMessageKey.set(null)
  }

  private loadMember() {
    return this.organizationService.getActiveMember().subscribe({
      next: (member) => {
        const role = Array.isArray(member.role) ? member.role.join(',') : member.role
        this.canEdit.set(role === 'owner')
      },
      error: () => {
        this.canEdit.set(false)
      },
    })
  }

  private loadSettings(appId: string) {
    if (!z.uuid().safeParse(appId).success) {
      this.isLoading.set(false)
      this.errorMessageKey.set('apps.replySettings.errors.loadFailed')
      return null
    }
    return this.replySettings.getReplySettings(appId).subscribe({
      next: (settings) => {
        this.setSettings(settings)
        this.isLoading.set(false)
      },
      error: () => {
        this.errorMessageKey.set('apps.replySettings.errors.loadFailed')
        this.isLoading.set(false)
      },
    })
  }

  protected setDefaultLanguage(value: string): void {
    this.model.update((model) => ({ ...model, defaultLanguage: value }))
  }

  protected addLanguage(): void {
    if (!this.canEdit() || this.isSaving()) {
      return
    }
    const languages = [
      ...new Set([...this.languages(), ...parseMappedLanguages(this.languageInput())]),
    ]
    const error = replySettingsValidationError(
      this.model().replyContext.trim(),
      this.model().defaultLanguage.trim(),
      languages,
    )
    if (error !== null) {
      this.errorMessageKey.set(error)
      return
    }
    this.model.update((model) => ({ ...model, mappedLanguagesText: languages.join('\n') }))
    this.languageInput.set('')
    this.errorMessageKey.set(null)
  }

  protected removeLanguage(language: string): void {
    if (!this.canEdit() || this.isSaving()) {
      return
    }
    this.model.update((model) => ({
      ...model,
      mappedLanguagesText: this.languages()
        .filter((tag) => tag !== language)
        .join('\n'),
    }))
  }

  protected retry(): void {
    this.reloadVersion.update((version) => version + 1)
  }

  protected submit(event: Event): void {
    event.preventDefault()

    const appId = this.appId()
    if (appId === '' || !this.isLoaded() || this.isSaving() || !this.canEdit()) {
      return
    }

    if (!this.validateForm()) {
      return
    }

    const request = this.toRequest()
    if (!request) {
      return
    }

    this.startSaving()
    this.saveReplySettings(appId, request)
  }

  private startSaving(): void {
    this.errorMessageKey.set(null)
    this.saved.set(false)
    this.isSaving.set(true)
  }

  private saveReplySettings(appId: string, request: UpdateReplySettingsRequest): void {
    this.replySettings
      .updateReplySettings(appId, request)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        takeUntil(this.scopeChanged),
        finalize(() => {
          this.isSaving.set(false)
        }),
      )
      .subscribe({
        next: (settings) => {
          this.setSettings(settings)
          this.saved.set(true)
          dispatchEvent(new CustomEvent('reviewinbox:apps-changed'))
        },
        error: (error: HttpErrorResponse) => {
          this.errorMessageKey.set(
            apiErrorMessageKey(error, 'apps.replySettings.errors.updateFailed'),
          )
        },
      })
  }

  private setSettings(settings: ReplySettingsResponse): void {
    this.languageInput.set('')
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
    const mappedLanguages = parseMappedLanguages(
      `${value.mappedLanguagesText}\n${this.languageInput()}`,
    )

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
