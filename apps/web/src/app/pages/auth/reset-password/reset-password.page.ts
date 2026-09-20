import { Component, computed, inject, signal } from '@angular/core'
import { FormField, form, minLength, required, submit } from '@angular/forms/signals'
import { ActivatedRoute, RouterLink } from '@angular/router'
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco'
import { AuthService } from 'ngx-better-auth'
import { ButtonModule } from 'primeng/button'
import { PasswordModule } from 'primeng/password'
import { firstValueFrom } from 'rxjs'
import { ThemeToggleComponent } from '../../../shared/components/theme-toggle/theme-toggle.component'

@Component({
  selector: 'ri-reset-password-page',
  imports: [ButtonModule, FormField, PasswordModule, RouterLink, ThemeToggleComponent, TranslocoDirective],
  templateUrl: './reset-password.page.html',
})
export class ResetPasswordPageComponent {
  private readonly auth = inject(AuthService)
  private readonly route = inject(ActivatedRoute)
  private readonly transloco = inject(TranslocoService)

  protected readonly token = this.route.snapshot.queryParamMap.get('token')
  protected readonly resetLanguage = this.supportedLanguage(this.route.snapshot.queryParamMap.get('lang'))
  protected readonly hasInvalidToken = this.route.snapshot.queryParamMap.has('error') || !this.token
  protected readonly errorMessage = signal<string | null>(null)
  protected readonly completed = signal(false)
  protected readonly isSubmitting = signal(false)
  protected readonly canSubmit = computed(() => this.resetPasswordForm().valid() && !this.isSubmitting())

  private readonly resetPasswordModel = signal({ newPassword: '', confirmPassword: '' })

  protected readonly resetPasswordForm = form(this.resetPasswordModel, (schema) => {
    required(schema.newPassword)
    minLength(schema.newPassword, 8)
    required(schema.confirmPassword)
  })

  constructor() {
    if (this.resetLanguage) {
      this.transloco.setActiveLang(this.resetLanguage)
    }
  }

  protected resetPassword(event: Event): void {
    event.preventDefault()

    if (this.isSubmitting()) {
      return
    }

    const value = this.resetPasswordForm().value()
    const token = this.token
    if (!token || !this.resetPasswordForm().valid() || value.newPassword !== value.confirmPassword) {
      this.resetPasswordForm().markAsTouched()
      return
    }

    this.errorMessage.set(null)
    this.isSubmitting.set(true)

    submit(this.resetPasswordForm, async () => {
      try {
        await firstValueFrom(this.auth.resetPassword({ newPassword: value.newPassword, token }))
        this.completed.set(true)
      } catch {
        this.errorMessage.set('auth.resetPassword.errors.invalidLink')
      } finally {
        this.isSubmitting.set(false)
      }
    })
  }

  private supportedLanguage(language: string | null): 'en' | 'fr' | null {
    return language === 'en' || language === 'fr' ? language : null
  }
}
