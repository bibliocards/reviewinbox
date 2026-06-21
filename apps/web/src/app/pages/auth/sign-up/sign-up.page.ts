import { Component, computed, inject, signal } from '@angular/core'
import { email, FormField, form, minLength, required, submit } from '@angular/forms/signals'
import { ActivatedRoute, Router, RouterLink } from '@angular/router'
import { AuthService, OrganizationService } from 'ngx-better-auth'
import { ButtonModule } from 'primeng/button'
import { InputTextModule } from 'primeng/inputtext'
import { PasswordModule } from 'primeng/password'
import { firstValueFrom } from 'rxjs'
import { ThemeToggleComponent } from '../../../shared/components/theme-toggle/theme-toggle.component'
import { AuthCapabilitiesService } from '../../../shared/services/auth-capabilities.service'

@Component({
  selector: 'ri-sign-up-page',
  imports: [ButtonModule, FormField, InputTextModule, PasswordModule, RouterLink, ThemeToggleComponent],
  templateUrl: './sign-up.page.html',
})
export class SignUpPageComponent {
  private readonly auth = inject(AuthService)
  private readonly authCapabilities = inject(AuthCapabilitiesService)
  private readonly organizations = inject(OrganizationService)
  private readonly route = inject(ActivatedRoute)
  private readonly router = inject(Router)

  protected readonly capabilities = this.authCapabilities.capabilities
  protected readonly errorMessage = signal<string | null>(null)
  protected readonly isSubmitting = signal(false)
  protected readonly canSubmit = computed(() => this.signUpForm().valid() && !this.isSubmitting())
  protected readonly invitationId = this.route.snapshot.queryParamMap.get('invitationId')
  protected readonly isInvitationSignUp = Boolean(this.invitationId)
  protected readonly redirectUrl = this.safeRedirect(this.route.snapshot.queryParamMap.get('redirect'))
  protected readonly selectedPlan = this.parseSelectedPlan(this.route.snapshot.queryParamMap.get('plan'))
  protected readonly loginQueryParams = computed(() => (this.redirectUrl ? { redirect: this.redirectUrl } : {}))

  private readonly signUpModel = signal({
    name: '',
    email: '',
    password: '',
    organizationName: this.isInvitationSignUp ? 'Invited Organization' : '',
  })

  protected readonly signUpForm = form(this.signUpModel, (schema) => {
    required(schema.name)
    required(schema.email)
    email(schema.email)
    required(schema.password)
    minLength(schema.password, 8)
    required(schema.organizationName)
  })

  protected createAccount(event: Event): void {
    event.preventDefault()

    if (!this.canSubmit()) {
      this.signUpForm().markAsTouched()
      return
    }

    this.errorMessage.set(null)
    this.isSubmitting.set(true)

    submit(this.signUpForm, async () => {
      const value = this.signUpForm().value()

      try {
        await firstValueFrom(
          this.auth.signUpEmail({
            name: value.name,
            email: value.email,
            password: value.password,
            username: this.slugify(value.email.split('@')[0] ?? value.name),
            ...(this.invitationId ? { invitationId: this.invitationId } : {}),
          } as Parameters<AuthService['signUpEmail']>[0] & { invitationId?: string }),
        )

        if (!this.isInvitationSignUp) {
          await firstValueFrom(
            this.organizations.create({
              name: value.organizationName,
              slug: this.slugify(value.organizationName),
            }),
          )
        }

        await this.router.navigateByUrl(this.redirectUrl ?? '/apps')
      } catch {
        this.errorMessage.set('We could not create this account yet.')
      } finally {
        this.isSubmitting.set(false)
      }
    })
  }

  private slugify(value: string): string {
    const slug = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

    return slug || 'organization'
  }

  private safeRedirect(redirect: string | null): string | null {
    return redirect?.startsWith('/') && !redirect.startsWith('//') ? redirect : null
  }

  private parseSelectedPlan(plan: string | null): 'free' | 'starter' | 'pro' | 'business' {
    if (plan === 'starter' || plan === 'pro' || plan === 'business') {
      return plan
    }

    return 'free'
  }
}
