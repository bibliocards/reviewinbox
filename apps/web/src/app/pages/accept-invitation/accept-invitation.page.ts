import { HttpClient } from '@angular/common/http'
import { Component, computed, effect, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { ActivatedRoute, Router, RouterLink } from '@angular/router'
import type { InvitationDetailsResponse } from '@reviewinbox/contracts'
import { AuthService, OrganizationService } from 'ngx-better-auth'
import { ButtonModule } from 'primeng/button'
import { firstValueFrom } from 'rxjs'
import { environment } from '../../../environments/environment'
import { resolveOptionalString } from '../../../environments/environment.model'
import { ThemeToggleComponent } from '../../shared/components/theme-toggle/theme-toggle.component'

@Component({
  selector: 'ri-accept-invitation-page',
  imports: [ButtonModule, RouterLink, ThemeToggleComponent],
  templateUrl: './accept-invitation.page.html',
})
export class AcceptInvitationPageComponent {
  private readonly http = inject(HttpClient)
  private readonly auth = inject(AuthService)
  private readonly organizations = inject(OrganizationService)
  private readonly route = inject(ActivatedRoute)
  private readonly router = inject(Router)

  protected readonly invitationId = this.route.snapshot.paramMap.get('invitationId') ?? ''
  private readonly apiUrl = resolveOptionalString(environment.apiUrl) ?? ''
  protected readonly redirectUrl = `/accept-invitation/${this.invitationId}`
  protected readonly invitation = signal<InvitationDetailsResponse | null>(null)
  protected readonly errorMessage = signal<string | null>(null)
  protected readonly isLoading = signal(true)
  protected readonly isAccepting = signal(false)
  protected readonly session = toSignal(this.auth.sessionState$, { initialValue: this.auth.session() })
  protected readonly loginQueryParams = computed(() => ({ redirect: this.redirectUrl }))
  protected readonly signUpQueryParams = computed(() => ({ invitationId: this.invitationId, redirect: this.redirectUrl }))

  private readonly didAccept = signal(false)

  constructor() {
    void this.loadInvitation()

    effect(() => {
      const session = this.session()
      const invitation = this.invitation()

      if (!session || !invitation || this.didAccept() || this.isAccepting()) {
        return
      }

      if (session.user.email.toLowerCase() !== invitation.email.toLowerCase()) {
        this.errorMessage.set(`This invitation is for ${invitation.email}. Sign in with that email address to accept it.`)
        return
      }

      this.didAccept.set(true)
      void this.acceptInvitation()
    })
  }

  protected async signOut(): Promise<void> {
    await firstValueFrom(this.auth.signOut())
    await this.router.navigate(['/login'], { queryParams: this.loginQueryParams() })
  }

  private async loadInvitation(): Promise<void> {
    if (!this.invitationId) {
      this.errorMessage.set('This invitation link is invalid.')
      this.isLoading.set(false)
      return
    }

    try {
      const invitation = await firstValueFrom(
        this.http.get<InvitationDetailsResponse>(`${this.apiUrl}/api/invitations/${this.invitationId}`),
      )
      this.invitation.set(invitation)
    } catch {
      this.errorMessage.set('We could not load this invitation. It may have expired or been canceled.')
    } finally {
      this.isLoading.set(false)
    }
  }

  private async acceptInvitation(): Promise<void> {
    this.isAccepting.set(true)
    this.errorMessage.set(null)

    try {
      const result = await firstValueFrom(this.organizations.acceptInvitation({ invitationId: this.invitationId }))
      await firstValueFrom(this.organizations.setActive({ organizationId: result.member.organizationId }))
      await this.router.navigateByUrl('/apps')
    } catch {
      this.didAccept.set(false)
      this.errorMessage.set('We could not accept this invitation yet.')
    } finally {
      this.isAccepting.set(false)
    }
  }
}
