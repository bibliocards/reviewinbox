import { Component, computed, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { FormField, form, required } from '@angular/forms/signals'
import { TranslocoDirective } from '@jsverse/transloco'
import type {
  AppListItemResponse,
  ConnectAppRequest,
  ConnectAppResponse,
  UpdateAppRequest,
  UpdateAppResponse,
} from '@reviewinbox/contracts'
import { ButtonModule } from 'primeng/button'
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog'
import { InputTextModule } from 'primeng/inputtext'
import { Step, StepList, StepPanel, StepPanels, Stepper } from 'primeng/stepper'
import { finalize } from 'rxjs'
import { AppsService } from '../../services/apps.service'

type ConnectAppDialogData = {
  app?: AppListItemResponse
}

@Component({
  selector: 'ri-connect-app-dialog',
  imports: [ButtonModule, FormField, FormsModule, InputTextModule, Step, StepList, StepPanel, StepPanels, Stepper, TranslocoDirective],
  templateUrl: './connect-app-dialog.component.html',
})
export class ConnectAppDialogComponent {
  private readonly apps = inject(AppsService)
  private readonly dialogRef = inject(DynamicDialogRef)
  private readonly dialogConfig = inject(DynamicDialogConfig<ConnectAppDialogData>)
  private readonly editableApp = (this.dialogConfig.data as ConnectAppDialogData | undefined)?.app
  private readonly existingAppleConnection = this.editableApp?.storeConnections.find(
    (connection) => connection.provider === 'apple_app_store',
  )
  private readonly existingGoogleConnection = this.editableApp?.storeConnections.find((connection) => connection.provider === 'google_play')

  protected readonly activeStep = signal(1)
  protected readonly isSaving = signal(false)
  protected readonly errorMessageKey = signal<string | null>(null)
  protected readonly isEditing = computed(() => this.editableApp != null)

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

  protected readonly submitLabelKey = computed(() =>
    this.isEditing()
      ? 'apps.connectDialog.actions.save'
      : this.hasCompleteAppleConnection() || this.hasCompleteGoogleConnection()
        ? 'apps.connectDialog.actions.createAndConnect'
        : 'apps.connectDialog.actions.create',
  )

  protected readonly appleCredentialPlaceholderKey = computed(() =>
    this.existingAppleConnection?.credential.hasCredential ? 'apps.connectDialog.credentials.keepExistingPlaceholder' : null,
  )

  protected readonly googleCredentialPlaceholderKey = computed(() =>
    this.existingGoogleConnection?.credential.hasCredential ? 'apps.connectDialog.credentials.keepExistingPlaceholder' : null,
  )

  protected nextStep(): void {
    if (!this.connectAppForm.appName().valid()) {
      this.connectAppForm.appName().markAsTouched()
      return
    }

    this.activeStep.set(2)
  }

  protected previousStep(): void {
    this.activeStep.set(1)
  }

  protected submit(event: Event): void {
    event.preventDefault()

    if (!this.connectAppForm().valid() || !this.providerFieldsAreValid()) {
      this.connectAppForm().markAsTouched()
      this.errorMessageKey.set('apps.connectDialog.errors.partialStoreConnection')
      return
    }

    this.errorMessageKey.set(null)
    this.isSaving.set(true)

    const editableApp = this.editableApp
    const request = editableApp ? this.apps.updateApp(editableApp.id, this.toUpdateRequest()) : this.apps.connectApp(this.toCreateRequest())

    request.pipe(finalize(() => this.isSaving.set(false))).subscribe({
      next: (result) => this.close(result),
      error: () =>
        this.errorMessageKey.set(this.isEditing() ? 'apps.connectDialog.errors.updateFailed' : 'apps.connectDialog.errors.createFailed'),
    })
  }

  private providerFieldsAreValid(): boolean {
    return this.appleFieldsAreValid() && this.googleFieldsAreValid()
  }

  private toCreateRequest(): ConnectAppRequest {
    const value = this.connectAppForm().value()
    const connections: ConnectAppRequest['connections'] = {}

    if (this.hasCompleteAppleConnection()) {
      connections.apple = {
        appStoreAppId: value.appleAppStoreAppId.trim(),
        issuerId: value.appleIssuerId.trim(),
        keyId: value.appleKeyId.trim(),
        privateKey: value.applePrivateKey.trim(),
      }
    }

    if (this.hasCompleteGoogleConnection()) {
      connections.google = {
        packageName: value.googlePackageName.trim(),
        serviceAccountJson: value.googleServiceAccountJson.trim(),
      }
    }

    return {
      app: { name: value.appName.trim() },
      connections,
    }
  }

  private toUpdateRequest(): UpdateAppRequest {
    const value = this.connectAppForm().value()
    const connections: UpdateAppRequest['connections'] = {}

    if (this.hasCompleteApplePublicFields()) {
      connections.apple = {
        appStoreAppId: value.appleAppStoreAppId.trim(),
        issuerId: value.appleIssuerId.trim(),
      }

      if (value.appleKeyId.trim() && value.applePrivateKey.trim()) {
        connections.apple.keyId = value.appleKeyId.trim()
        connections.apple.privateKey = value.applePrivateKey.trim()
      }
    }

    if (value.googlePackageName.trim()) {
      connections.google = {
        packageName: value.googlePackageName.trim(),
      }

      if (value.googleServiceAccountJson.trim()) {
        connections.google.serviceAccountJson = value.googleServiceAccountJson.trim()
      }
    }

    return {
      app: { name: value.appName.trim() },
      connections,
    }
  }

  private close(result: ConnectAppResponse | UpdateAppResponse): void {
    this.dialogRef.close(result)
  }

  private hasCompleteAppleConnection(): boolean {
    const value = this.connectAppForm().value()
    return Boolean(value.appleAppStoreAppId.trim() && value.appleIssuerId.trim() && value.appleKeyId.trim() && value.applePrivateKey.trim())
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
    const fields = [value.appleAppStoreAppId, value.appleIssuerId, value.appleKeyId, value.applePrivateKey]
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
      (!hasAnyPublicField && !hasAnyCredentialField) ||
      (this.hasCompleteApplePublicFields() && (!hasAnyCredentialField || this.hasCompleteAppleConnection()))
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
