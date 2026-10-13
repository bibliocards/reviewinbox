import { HttpErrorResponse } from '@angular/common/http'
import {
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { FormField, form, required } from '@angular/forms/signals'
import { TranslocoDirective } from '@jsverse/transloco'
import type {
  AppListItemResponse,
  ConnectAppRequest,
  ConnectAppResponse,
  UpdateAppRequest,
} from '@reviewinbox/contracts'
import { ButtonModule } from 'primeng/button'
import { CheckboxModule } from 'primeng/checkbox'
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog'
import { FileUploadModule, type FileSelectEvent } from 'primeng/fileupload'
import { InputTextModule } from 'primeng/inputtext'
import { SelectButtonModule } from 'primeng/selectbutton'
import { Step, StepList, StepPanel, StepPanels, Stepper } from 'primeng/stepper'
import { TextareaModule } from 'primeng/textarea'
import { finalize } from 'rxjs'

import { connectAppErrorMessageKey } from '../../connect-app-errors'
import { AppsService } from '../../services/apps.service'
import { googleCredentialError, maxCredentialFileSize } from './google-credential-input'

type ConnectAppDialogData = { app?: AppListItemResponse }

@Component({
  selector: 'ri-connect-app-dialog',
  imports: [
    ButtonModule,
    FormField,
    FormsModule,
    InputTextModule,
    Step,
    StepList,
    StepPanel,
    StepPanels,
    Stepper,
    TranslocoDirective,
    CheckboxModule,
    SelectButtonModule,
    FileUploadModule,
    TextareaModule,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './connect-app-dialog.component.html',
})
export class ConnectAppDialogComponent {
  private readonly apps = inject(AppsService)
  private readonly destroyRef = inject(DestroyRef)
  private fileReadVersion = 0
  private readonly dialogRef = inject(DynamicDialogRef)
  private readonly dialogConfig =
    inject<DynamicDialogConfig<ConnectAppDialogData>>(DynamicDialogConfig)
  private readonly editableApp = this.dialogConfig.data?.app
  private readonly existingAppleConnection = this.editableApp?.storeConnections.find(
    (connection) => connection.provider === 'apple_app_store',
  )
  private readonly existingGoogleConnection = this.editableApp?.storeConnections.find(
    (connection) => connection.provider === 'google_play',
  )

  protected readonly activeStep = signal(1)
  protected readonly isSaving = signal(false)
  protected readonly errorMessageKey = signal<string | null>(null)
  protected readonly isEditing = computed(() => this.editableApp !== undefined)
  protected readonly appleSelected = signal(this.existingAppleConnection !== undefined)
  protected readonly googleSelected = signal(this.existingGoogleConnection !== undefined)
  protected readonly credentialStore = signal<'apple' | 'google'>('apple')
  protected readonly googleInputMethod = signal<'upload' | 'paste'>('paste')
  protected readonly maxCredentialFileSize = maxCredentialFileSize
  protected readonly stepperTokens = {
    separator: { size: '0px' },
    step: { padding: '0', gap: '12px' },
    stepHeader: { padding: '9px 0' },
    stepTitle: { activeColor: 'var(--color-ink)' },
    stepNumber: {
      size: '26px',
      fontSize: '13px',
      shadow: 'none',
      activeBackground: 'var(--color-primary)',
      activeBorderColor: 'var(--color-primary)',
      activeColor: 'white',
    },
  }
  protected readonly isReadingFile = signal(false)
  private readonly credentialFileError = signal<string | null>(null)
  protected readonly appName = computed(() => this.model().appName)
  protected readonly appleAppId = computed(() => this.model().appleAppStoreAppId)
  protected readonly googlePackageName = computed(() => this.model().googlePackageName)
  protected readonly credentialStoreOptions = computed(() => [
    ...(this.appleSelected() ? [{ label: 'Apple App Store', value: 'apple' }] : []),
    ...(this.googleSelected() ? [{ label: 'Google Play', value: 'google' }] : []),
  ])
  protected readonly inputMethods = [
    { labelKey: 'apps.connectDialog.credentials.upload', value: 'upload' },
    { labelKey: 'apps.connectDialog.credentials.paste', value: 'paste' },
  ]

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.fileReadVersion += 1
    })
  }

  private readonly model = signal({
    appName: this.editableApp?.name ?? '',
    appleAppStoreAppId: this.existingAppleConnection?.externalAppId ?? '',
    appleIssuerId: this.existingAppleConnection?.externalStoreId ?? '',
    appleKeyId: '',
    applePrivateKey: '',
    googlePackageName: this.existingGoogleConnection?.externalAppId ?? '',
    googleServiceAccountJson: '',
  })

  protected readonly connectAppForm = form(this.model, (schema) => {
    required(schema.appName)
  })

  protected readonly submitLabelKey = computed(() => {
    if (this.isEditing()) {
      return 'apps.connectDialog.actions.save'
    }

    return (this.appleSelected() && this.hasCompleteAppleConnection())
      || (this.googleSelected() && this.hasCompleteGoogleConnection())
      ? 'apps.connectDialog.actions.createAndConnect'
      : 'apps.connectDialog.actions.create'
  })

  protected readonly appleCredentialPlaceholderKey = computed(() =>
    this.existingAppleConnection?.credential.hasCredential === true
      ? 'apps.connectDialog.credentials.keepExistingPlaceholder'
      : null,
  )

  protected readonly googleCredentialPlaceholderKey = computed(() =>
    this.existingGoogleConnection?.credential.hasCredential === true
      ? 'apps.connectDialog.credentials.keepExistingPlaceholder'
      : null,
  )

  protected nextStep(): void {
    if (!this.validateAppName()) {
      return
    }

    if (this.isSaving() || this.isReadingFile()) {
      return
    }
    if (this.activeStep() === 3 && !this.validateProviders()) {
      return
    }
    if (this.activeStep() === 2) {
      this.credentialStore.set(this.appleSelected() ? 'apple' : 'google')
    }
    this.errorMessageKey.set(null)
    this.activeStep.update((step) => Math.min(step + 1, 4))
  }

  protected previousStep(): void {
    if (this.isSaving() || this.isReadingFile()) {
      return
    }
    this.errorMessageKey.set(null)
    this.activeStep.update((step) => Math.max(step - 1, 1))
  }

  protected submit(event: Event): void {
    event.preventDefault()

    if (this.isSaving() || this.isReadingFile()) {
      return
    }
    if (this.activeStep() !== 4) {
      this.nextStep()
      return
    }

    if (!this.validateAppName() || !this.validateProviders()) {
      return
    }

    this.saveApp()
  }

  private saveApp(): void {
    this.errorMessageKey.set(null)
    this.isSaving.set(true)

    const editableApp = this.editableApp
    const request = editableApp
      ? this.apps.updateApp(editableApp.id, this.toUpdateRequest())
      : this.apps.connectApp(this.toCreateRequest())

    request
      .pipe(
        finalize(() => {
          this.isSaving.set(false)
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (result) => {
          this.close(result)
        },
        error: (error: HttpErrorResponse) => {
          this.errorMessageKey.set(
            connectAppErrorMessageKey(
              error,
              this.isEditing()
                ? 'apps.connectDialog.errors.updateFailed'
                : 'apps.connectDialog.errors.createFailed',
            ),
          )
        },
      })
  }

  private providerFieldsAreValid(): boolean {
    return (
      (!this.appleSelected() || this.appleFieldsAreValid())
      && (!this.googleSelected() || this.googleFieldsAreValid())
    )
  }

  private validateAppName(): boolean {
    if (this.connectAppForm.appName().valid() && this.appName().trim()) {
      return true
    }
    this.connectAppForm.appName().markAsTouched()
    this.errorMessageKey.set('apps.connectDialog.errors.appNameRequired')
    return false
  }

  private validateProviders(): boolean {
    if (
      this.googleSelected()
      && this.googleInputMethod() === 'upload'
      && this.credentialFileError() !== null
    ) {
      this.errorMessageKey.set(this.credentialFileError())
      return false
    }
    if (!this.providerFieldsAreValid() || !this.newConnectionsAreComplete()) {
      this.errorMessageKey.set('apps.connectDialog.errors.partialStoreConnection')
      return false
    }
    const credential = this.model().googleServiceAccountJson.trim()
    const error = this.googleSelected() && credential ? googleCredentialError(credential) : null
    this.errorMessageKey.set(error)
    return error === null
  }

  private newConnectionsAreComplete(): boolean {
    const appleComplete =
      !this.appleSelected()
      || this.existingAppleConnection !== undefined
      || this.hasCompleteAppleConnection()
    const googleComplete =
      !this.googleSelected()
      || this.existingGoogleConnection !== undefined
      || this.hasCompleteGoogleConnection()
    return appleComplete && googleComplete
  }

  protected async readGoogleCredential(event: FileSelectEvent): Promise<void> {
    const file = event.files[0]
    if (!file || this.isSaving()) {
      return
    }
    const version = ++this.fileReadVersion
    this.credentialFileError.set(null)
    this.model.update((model) => ({ ...model, googleServiceAccountJson: '' }))
    this.isReadingFile.set(true)
    await this.readCredential(file, version)
  }

  private async readCredential(file: File, version: number): Promise<void> {
    try {
      const text = await file.text()
      if (version === this.fileReadVersion) {
        this.applyGoogleCredential(text, file.size)
      }
    } catch {
      if (version === this.fileReadVersion) {
        this.credentialFileError.set('apps.connectDialog.errors.credentialFileFailed')
        this.errorMessageKey.set('apps.connectDialog.errors.credentialFileFailed')
      }
    } finally {
      if (version === this.fileReadVersion) {
        this.isReadingFile.set(false)
      }
    }
  }

  private applyGoogleCredential(text: string, size: number): void {
    const error =
      size > maxCredentialFileSize
        ? 'apps.connectDialog.errors.credentialTooLarge'
        : googleCredentialError(text)
    this.errorMessageKey.set(error)
    this.credentialFileError.set(error)
    if (error === null) {
      this.model.update((model) => ({ ...model, googleServiceAccountJson: text }))
    }
  }

  protected clearGoogleFile(): void {
    this.fileReadVersion += 1
    this.isReadingFile.set(false)
    this.credentialFileError.set(null)
    this.errorMessageKey.set(null)
    this.model.update((model) => ({ ...model, googleServiceAccountJson: '' }))
  }

  private toCreateRequest(): ConnectAppRequest {
    const value = this.connectAppForm().value()
    const connections: ConnectAppRequest['connections'] = {}

    if (this.appleSelected() && this.hasCompleteAppleConnection()) {
      connections.apple = {
        appStoreAppId: value.appleAppStoreAppId.trim(),
        issuerId: value.appleIssuerId.trim(),
        keyId: value.appleKeyId.trim(),
        privateKey: value.applePrivateKey.trim(),
      }
    }

    if (this.googleSelected() && this.hasCompleteGoogleConnection()) {
      connections.google = {
        packageName: value.googlePackageName.trim(),
        serviceAccountJson: value.googleServiceAccountJson.trim(),
      }
    }

    return { app: { name: value.appName.trim() }, connections }
  }

  private toUpdateRequest(): UpdateAppRequest {
    const value = this.connectAppForm().value()
    const connections: UpdateAppRequest['connections'] = {}

    if (this.appleSelected() && this.hasCompleteApplePublicFields()) {
      connections.apple = {
        appStoreAppId: value.appleAppStoreAppId.trim(),
        issuerId: value.appleIssuerId.trim(),
      }

      if (value.appleKeyId.trim() && value.applePrivateKey.trim()) {
        connections.apple.keyId = value.appleKeyId.trim()
        connections.apple.privateKey = value.applePrivateKey.trim()
      }
    }

    if (this.googleSelected() && value.googlePackageName.trim()) {
      connections.google = { packageName: value.googlePackageName.trim() }

      if (value.googleServiceAccountJson.trim()) {
        connections.google.serviceAccountJson = value.googleServiceAccountJson.trim()
      }
    }

    return { app: { name: value.appName.trim() }, connections }
  }

  private close(result: ConnectAppResponse): void {
    this.dialogRef.close(result)
  }

  private hasCompleteAppleConnection(): boolean {
    const value = this.connectAppForm().value()
    return Boolean(
      value.appleAppStoreAppId.trim()
      && value.appleIssuerId.trim()
      && value.appleKeyId.trim()
      && value.applePrivateKey.trim(),
    )
  }

  private hasCompleteApplePublicFields(): boolean {
    const value = this.connectAppForm().value()
    return Boolean(value.appleAppStoreAppId.trim() && value.appleIssuerId.trim())
  }

  private hasCompleteGoogleConnection(): boolean {
    const value = this.connectAppForm().value()
    return Boolean(value.googlePackageName.trim() && value.googleServiceAccountJson.trim())
  }

  private hasPartialAppleConnection(): boolean {
    const value = this.connectAppForm().value()
    const fields = [
      value.appleAppStoreAppId,
      value.appleIssuerId,
      value.appleKeyId,
      value.applePrivateKey,
    ]
    return fields.some((field) => field.trim()) && !this.hasCompleteAppleConnection()
  }

  private hasPartialGoogleConnection(): boolean {
    const value = this.connectAppForm().value()
    const fields = [value.googlePackageName, value.googleServiceAccountJson]
    return fields.some((field) => field.trim()) && !this.hasCompleteGoogleConnection()
  }

  private appleFieldsAreValid(): boolean {
    if (!this.isEditing()) {
      return !this.hasPartialAppleConnection()
    }

    const value = this.connectAppForm().value()
    const hasAnyPublicField = Boolean(value.appleAppStoreAppId.trim() || value.appleIssuerId.trim())
    const hasAnyCredentialField = Boolean(value.appleKeyId.trim() || value.applePrivateKey.trim())

    return (
      (!hasAnyPublicField && !hasAnyCredentialField)
      || (this.hasCompleteApplePublicFields()
        && (!hasAnyCredentialField || this.hasCompleteAppleConnection()))
    )
  }

  private googleFieldsAreValid(): boolean {
    if (!this.isEditing()) {
      return !this.hasPartialGoogleConnection()
    }

    const value = this.connectAppForm().value()
    return !value.googleServiceAccountJson.trim() || Boolean(value.googlePackageName.trim())
  }
}
