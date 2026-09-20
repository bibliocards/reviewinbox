import { Component, computed, inject, signal } from '@angular/core'
import { email, FormField, form, required, submit } from '@angular/forms/signals'
import { RouterLink } from '@angular/router'
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco'
import { AuthService } from 'ngx-better-auth'
import { ButtonModule } from 'primeng/button'
import { InputTextModule } from 'primeng/inputtext'
import { firstValueFrom } from 'rxjs'
import { ThemeToggleComponent } from '../../../shared/components/theme-toggle/theme-toggle.component'

@Component({
  selector: 'ri-forgot-password-page',
  imports: [ButtonModule, FormField, InputTextModule, RouterLink, ThemeToggleComponent, TranslocoDirective],
  templateUrl: './forgot-password.page.html',
})
export class ForgotPasswordPageComponent {
  private readonly auth = inject(AuthService)
  private readonly transloco = inject(TranslocoService)

  protected readonly errorMessage = signal<string | null>(null)
  protected readonly requestSent = signal(false)
  protected readonly isSubmitting = signal(false)
  protected readonly canSubmit = computed(() => this.forgotPasswordForm().valid() && !this.isSubmitting())

  private readonly forgotPasswordModel = signal({ email: '' })

  protected readonly forgotPasswordForm = form(this.forgotPasswordModel, (schema) => {
    required(schema.email)
    email(schema.email)
  })

  protected requestReset(event: Event): void {
    event.preventDefault()

    if (this.isSubmitting()) {
      return
    }

    if (!this.canSubmit()) {
      this.forgotPasswordForm().markAsTouched()
      return
    }

    this.errorMessage.set(null)
    this.isSubmitting.set(true)

    submit(this.forgotPasswordForm, async () => {
      try {
        await firstValueFrom(
          this.auth.requestPasswordReset({
            email: this.forgotPasswordForm().value().email,
            redirectTo: `${window.location.origin}/reset-password?lang=${this.resetLanguage()}`,
          }),
        )
        this.requestSent.set(true)
      } catch {
        this.errorMessage.set('auth.forgotPassword.errors.unavailable')
      } finally {
        this.isSubmitting.set(false)
      }
    })
  }

  private resetLanguage(): 'en' | 'fr' {
    return this.transloco.getActiveLang() === 'fr' ? 'fr' : 'en'
  }
}
