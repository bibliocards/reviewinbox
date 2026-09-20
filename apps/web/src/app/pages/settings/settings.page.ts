import { Component, computed, effect, inject, signal, ChangeDetectionStrategy } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormField, form, minLength, required } from '@angular/forms/signals'
import { TranslocoDirective } from '@jsverse/transloco'
import { AuthService } from 'ngx-better-auth'
import { ButtonModule } from 'primeng/button'
import { InputTextModule } from 'primeng/inputtext'
import { PasswordModule } from 'primeng/password'
import { firstValueFrom } from 'rxjs'

@Component({
  selector: 'ri-settings-page',
  imports: [ButtonModule, FormField, InputTextModule, PasswordModule, TranslocoDirective],
  templateUrl: './settings.page.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './settings.page.css',
})
export class SettingsPageComponent {
  private readonly auth = inject(AuthService)
  private readonly session = toSignal(this.auth.sessionState$, { initialValue: null })

  protected readonly user = computed(() => this.session()?.user ?? null)
  protected readonly profileError = signal<string | null>(null)
  protected readonly profileSuccess = signal<string | null>(null)
  protected readonly passwordError = signal<string | null>(null)
  protected readonly passwordSuccess = signal<string | null>(null)
  protected readonly isSavingProfile = signal(false)
  protected readonly isChangingPassword = signal(false)

  private readonly profileModel = signal({ name: '' })
  private readonly passwordModel = signal({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  private didInitializeProfile = false

  protected readonly profileForm = form(this.profileModel, (schema) => {
    required(schema.name)
  })

  protected readonly passwordForm = form(this.passwordModel, (schema) => {
    required(schema.currentPassword)
    required(schema.newPassword)
    minLength(schema.newPassword, 8)
    required(schema.confirmPassword)
  })

  protected readonly canSavePassword = computed(() => {
    const value = this.passwordForm().value()
    return (
      this.passwordForm().valid()
      && value.newPassword === value.confirmPassword
      && !this.isChangingPassword()
    )
  })

  constructor() {
    effect(() => {
      const user = this.user()
      if (!user || this.didInitializeProfile) {
        return
      }

      this.profileModel.set({ name: user.name ?? '' })
      this.didInitializeProfile = true
    })
  }

  protected saveProfile(event: Event): void {
    event.preventDefault()

    if (this.isSavingProfile()) {
      return
    }

    const name = this.profileForm().value().name.trim()
    if (!this.profileForm().valid() || name === '') {
      this.showInvalidProfileName()
      return
    }

    this.prepareProfileSave()
    this.persistProfile(name)
  }

  private showInvalidProfileName(): void {
    this.profileError.set('accountSettings.profile.errors.nameRequired')
    this.profileSuccess.set(null)
    this.profileForm().markAsTouched()
  }

  private prepareProfileSave(): void {
    this.profileError.set(null)
    this.profileSuccess.set(null)
    this.isSavingProfile.set(true)
  }

  private persistProfile(name: string): void {
    firstValueFrom(this.auth.updateUser({ name }))
      .then(() => {
        this.profileSuccess.set('accountSettings.profile.saved')
        return null
      })
      .catch(() => {
        this.profileError.set('accountSettings.profile.errors.saveFailed')
        return null
      })
      .finally(() => {
        this.isSavingProfile.set(false)
      })
  }

  protected changePassword(event: Event): void {
    event.preventDefault()

    if (this.isChangingPassword()) {
      return
    }

    const value = this.passwordForm().value()
    if (!this.passwordForm().valid() || value.newPassword !== value.confirmPassword) {
      this.passwordForm().markAsTouched()
      return
    }

    this.passwordError.set(null)
    this.passwordSuccess.set(null)
    this.isChangingPassword.set(true)

    firstValueFrom(
      this.auth.changePassword({
        currentPassword: value.currentPassword,
        newPassword: value.newPassword,
        revokeOtherSessions: true,
      }),
    )
      .then(() => {
        this.passwordForm().reset({ currentPassword: '', newPassword: '', confirmPassword: '' })
        this.passwordSuccess.set('accountSettings.password.changed')
        return null
      })
      .catch(() => {
        this.passwordError.set('accountSettings.password.errors.changeFailed')
        return null
      })
      .finally(() => {
        this.isChangingPassword.set(false)
      })
  }
}
