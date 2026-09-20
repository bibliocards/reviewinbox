import { Component, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core'
import { email, FormField, form, minLength, required, submit } from '@angular/forms/signals'
import { ActivatedRoute, Router, RouterLink } from '@angular/router'
import { AuthService, OrganizationService } from 'ngx-better-auth'
import { ButtonModule } from 'primeng/button'
import { InputTextModule } from 'primeng/inputtext'
import { PasswordModule } from 'primeng/password'
import { firstValueFrom } from 'rxjs'

import { ThemeToggleComponent } from '../../../shared/components/theme-toggle/theme-toggle.component'
import { AuthCapabilitiesService } from '../../../shared/services/auth-capabilities.service'

type SignUpFormValue = { name: string; email: string; password: string; organizationName: string }

@Component({
  selector: 'ri-sign-up-page',
  imports: [
    ButtonModule,
    FormField,
    InputTextModule,
    PasswordModule,
    RouterLink,
    ThemeToggleComponent,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
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
  protected readonly redirectUrl = this.safeRedirect(
    this.route.snapshot.queryParamMap.get('redirect'),
  )
  protected readonly selectedPlan = this.parseSelectedPlan(
    this.route.snapshot.queryParamMap.get('plan'),
  )
  protected readonly loginQueryParams = computed(() =>
    this.redirectUrl === null ? {} : { redirect: this.redirectUrl },
  )
  protected readonly createsOrganizationDuringSignUp = computed(
    () => !this.capabilities().isCloud && !this.isInvitationSignUp,
  )

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
  })

  protected createAccount(event: Event): void {
    event.preventDefault()

    if (!this.canSubmit()) {
      this.signUpForm().markAsTouched()
      return
    }

    this.errorMessage.set(null)
    this.isSubmitting.set(true)

    void submit(this.signUpForm, () => this.completeSignUp())
  }

  private async completeSignUp(): Promise<void> {
    const value = this.signUpForm().value()

    try {
      if (this.createsOrganizationDuringSignUp() && value.organizationName.trim() === '') {
        this.errorMessage.set('Enter an Organization name to finish setup.')
        return
      }

      await this.registerAccount(value)

      if (this.createsOrganizationDuringSignUp()) {
        await this.createOrganization(value.organizationName)
      }

      await this.navigateAfterSignUp()
    } catch {
      this.errorMessage.set('We could not create this account yet.')
    } finally {
      this.isSubmitting.set(false)
    }
  }

  private async registerAccount(value: SignUpFormValue): Promise<void> {
    const request = {
      name: value.name,
      email: value.email,
      password: value.password,
      username: this.slugify(value.email.split('@')[0] ?? value.name),
    }

    // SAFETY: the invitation endpoint accepts this additional id alongside the Better Auth sign-up fields.
    const invitationRequest =
      this.invitationId === null ? request : { ...request, invitationId: this.invitationId }
    await firstValueFrom(this.auth.signUpEmail(invitationRequest))
  }

  private async createOrganization(name: string): Promise<void> {
    await firstValueFrom(this.organizations.create({ name, slug: this.slugify(name) }))
  }

  private navigateAfterSignUp(): Promise<boolean> {
    if (!this.isInvitationSignUp && this.capabilities().isCloud) {
      return this.router.navigate(['/organizations/new'], {
        queryParams: { plan: this.selectedPlan },
      })
    }

    return this.router.navigateByUrl(this.redirectUrl ?? '/apps')
  }

  private slugify(value: string): string {
    const slug = value
      .trim()
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/gu, '-')
      .replaceAll(/^-|-$/gu, '')

    return slug || 'organization'
  }

  private safeRedirect(redirect: string | null): string | null {
    return redirect !== null && redirect.startsWith('/') && !redirect.startsWith('//')
      ? redirect
      : null
  }

  private parseSelectedPlan(plan: string | null): 'free' | 'starter' | 'pro' | 'business' {
    if (plan === 'starter' || plan === 'pro' || plan === 'business') {
      return plan
    }

    return 'free'
  }
}
