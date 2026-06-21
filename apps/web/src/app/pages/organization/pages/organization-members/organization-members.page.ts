import { Component, computed, HostListener, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { email, FormField, form, required, submit } from '@angular/forms/signals'
import { TranslocoDirective } from '@jsverse/transloco'
import { AuthService, OrganizationService } from 'ngx-better-auth'
import { ButtonModule } from 'primeng/button'
import { InputTextModule } from 'primeng/inputtext'
import { SelectModule } from 'primeng/select'
import { firstValueFrom } from 'rxjs'
import { betterAuthErrorKey } from '../../../../shared/better-auth-errors'
import { AuthCapabilitiesService } from '../../../../shared/services/auth-capabilities.service'

type MemberView = {
  id: string
  role: string | string[]
  createdAt?: Date | string
  user?: {
    id?: string
    name?: string | null
    email?: string | null
  }
  userId?: string
}

type InvitationView = {
  id: string
  email: string
  role?: string | string[]
  status?: string
  expiresAt?: Date | string
}

type FullOrganizationView = {
  members?: MemberView[]
}

@Component({
  selector: 'ri-organization-members-page',
  imports: [ButtonModule, FormField, InputTextModule, SelectModule, TranslocoDirective],
  templateUrl: './organization-members.page.html',
})
export class OrganizationMembersPageComponent {
  private readonly auth = inject(AuthService)
  private readonly organizations = inject(OrganizationService)
  private readonly authCapabilities = inject(AuthCapabilitiesService)

  protected readonly fullOrganization = this.organizations.fullOrganizationResource(() => ({ membersLimit: 100 }))
  protected readonly invitations = this.organizations.invitationsResource(() => ({}))
  protected readonly clientConfig = toSignal(this.authCapabilities.clientConfig(), { initialValue: null })
  protected readonly errorMessageKey = signal<string | null>(null)
  protected readonly successMessageKey = signal<string | null>(null)
  protected readonly copiedInvitationId = signal<string | null>(null)
  protected readonly latestInvitationId = signal<string | null>(null)
  protected readonly latestInvitationLink = signal<string | null>(null)
  protected readonly isSubmitting = signal(false)

  protected readonly roleOptions = [
    { label: 'Member', value: 'member' },
    { label: 'Admin', value: 'admin' },
  ]

  private readonly inviteModel = signal({
    email: '',
    role: 'member',
  })

  protected readonly inviteForm = form(this.inviteModel, (schema) => {
    required(schema.email)
    email(schema.email)
    required(schema.role)
  })

  protected readonly members = computed(() => {
    if (this.fullOrganization.error()) {
      return []
    }

    return (this.fullOrganization.value() as FullOrganizationView | undefined)?.members ?? []
  })
  protected readonly pendingInvitations = computed(() =>
    this.invitations.error()
      ? []
      : ((this.invitations.value() as InvitationView[] | undefined) ?? []).filter((invitation) => invitation.status === 'pending'),
  )

  @HostListener('window:reviewinbox:active-organization-changed')
  protected reloadForActiveOrganization(): void {
    this.errorMessageKey.set(null)
    this.successMessageKey.set(null)
    this.copiedInvitationId.set(null)
    this.latestInvitationId.set(null)
    this.latestInvitationLink.set(null)
    this.fullOrganization.reload()
    this.invitations.reload()
  }

  protected inviteMember(event: Event): void {
    event.preventDefault()

    if (!this.inviteForm().valid()) {
      this.inviteForm().markAsTouched()
      return
    }

    this.errorMessageKey.set(null)
    this.successMessageKey.set(null)
    this.isSubmitting.set(true)

    submit(this.inviteForm, async () => {
      const value = this.inviteForm().value()

      try {
        const invitation = await firstValueFrom(this.organizations.inviteMember({ email: value.email, role: value.role }))
        this.inviteModel.set({ email: '', role: 'member' })
        this.latestInvitationId.set(invitation.id)
        this.latestInvitationLink.set(this.invitationLink(invitation.id))
        this.invitations.reload()
        this.successMessageKey.set('organization.members.inviteSent')
      } catch (error) {
        this.errorMessageKey.set(betterAuthErrorKey(error, 'organization.members.errors.inviteFailed'))
      } finally {
        this.isSubmitting.set(false)
      }
    })
  }

  protected cancelInvitation(invitationId: string): void {
    this.errorMessageKey.set(null)
    this.successMessageKey.set(null)

    firstValueFrom(this.organizations.cancelInvitation({ invitationId }))
      .then(() => {
        this.invitations.reload()
        this.successMessageKey.set('organization.members.inviteCanceled')
      })
      .catch(() => this.errorMessageKey.set('organization.members.errors.cancelFailed'))
  }

  protected roleLabel(role: string | string[] | undefined): string {
    return Array.isArray(role) ? role.join(', ') : (role ?? 'member')
  }

  protected invitationLink(invitationId: string): string {
    const appPublicUrl = this.clientConfig()?.appPublicUrl ?? globalThis.location.origin
    return new URL(`/accept-invitation/${invitationId}`, appPublicUrl).toString()
  }

  protected copyInvitationLink(invitationId: string): void {
    const link = this.invitationLink(invitationId)

    navigator.clipboard
      .writeText(link)
      .then(() => this.copiedInvitationId.set(invitationId))
      .catch(() => this.errorMessageKey.set('organization.members.errors.copyFailed'))
  }

  protected initialsFrom(member: MemberView): string {
    const label = member.user?.name ?? member.user?.email ?? 'Member'

    return label
      .split(/[ @._-]/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase()
  }

  protected isCurrentUser(member: MemberView): boolean {
    const sessionUser = this.auth.session()?.user
    return Boolean(sessionUser?.id && (member.userId === sessionUser.id || member.user?.id === sessionUser.id))
  }
}
