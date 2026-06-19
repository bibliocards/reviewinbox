import { Component, computed, effect, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { email, FormField, form, required, submit } from '@angular/forms/signals'
import { Router, RouterLink } from '@angular/router'
import { AuthService } from 'ngx-better-auth'
import { ButtonModule } from 'primeng/button'
import { InputTextModule } from 'primeng/inputtext'
import { PasswordModule } from 'primeng/password'
import { firstValueFrom } from 'rxjs'
import { ThemeToggleComponent } from '../../../shared/components/theme-toggle/theme-toggle.component'
import { AuthCapabilitiesService } from '../../../shared/services/auth-capabilities.service'

@Component({
  selector: 'ri-login-page',
  imports: [ButtonModule, FormField, InputTextModule, PasswordModule, RouterLink, ThemeToggleComponent],
  templateUrl: './login.page.html',
})
export class LoginPageComponent {
  private readonly auth = inject(AuthService)
  private readonly authCapabilities = inject(AuthCapabilitiesService)
  private readonly router = inject(Router)

  protected readonly capabilities = this.authCapabilities.capabilities
  protected readonly signUpAvailable = toSignal(this.authCapabilities.signUpAvailable(), {
    initialValue: this.capabilities.deploymentMode === 'cloud',
  })
  protected readonly errorMessage = signal<string | null>(null)
  protected readonly isSubmitting = signal(false)
  protected readonly canSubmit = computed(() => this.loginForm().valid() && !this.isSubmitting())

  private readonly loginModel = signal({
    email: '',
    password: '',
  })

  protected readonly loginForm = form(this.loginModel, (schema) => {
    required(schema.email)
    email(schema.email)
    required(schema.password)
  })

  constructor() {
    effect(() => {
      if (this.capabilities.deploymentMode === 'self-hosted' && this.signUpAvailable()) {
        void this.router.navigateByUrl('/sign-up')
      }
    })
  }

  protected signIn(event: Event): void {
    event.preventDefault()

    if (!this.canSubmit()) {
      this.loginForm().markAsTouched()
      return
    }

    this.errorMessage.set(null)
    this.isSubmitting.set(true)

    submit(this.loginForm, async () => {
      try {
        await firstValueFrom(this.auth.signInEmail(this.loginForm().value()))
        await this.router.navigateByUrl('/')
      } catch {
        this.errorMessage.set('We could not sign you in with these credentials.')
      } finally {
        this.isSubmitting.set(false)
      }
    })
  }
}
