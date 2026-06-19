import { Component, computed, inject, signal } from '@angular/core'
import { email, FormField, form, required, submit } from '@angular/forms/signals'
import { TranslocoDirective } from '@jsverse/transloco'
import { OrganizationService } from 'ngx-better-auth'
import { ButtonModule } from 'primeng/button'
import { InputTextModule } from 'primeng/inputtext'
import { SelectModule } from 'primeng/select'
import { firstValueFrom } from 'rxjs'
import { betterAuthErrorKey } from '../../../../shared/better-auth-errors'

type MemberView = {
  id: string
  role: string | string[]
  createdAt?: Date | string
  user?: {
    name?: string | null
    email?: string | null
  }
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
  private readonly organizations = inject(OrganizationService)

  protected readonly fullOrganization = this.organizations.fullOrganizationResource(() => ({ membersLimit: 100 }))
  protected readonly invitations = this.organizations.invitationsResource(() => ({}))
  protected readonly errorMessageKey = signal<string | null>(null)
  protected readonly successMessageKey = signal<string | null>(null)
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
      : ((this.invitations.value() as InvitationView[] | undefined) ?? []).filter((invitation) => invitation.status !== 'canceled'),
  )

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
        await firstValueFrom(this.organizations.inviteMember({ email: value.email, role: value.role }))
        this.inviteModel.set({ email: '', role: 'member' })
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
}
