import { Component, computed, inject, input, output, signal } from '@angular/core'
import { FormField, form, required, submit } from '@angular/forms/signals'
import { OrganizationService } from 'ngx-better-auth'
import { ButtonModule } from 'primeng/button'
import { InputTextModule } from 'primeng/inputtext'
import { firstValueFrom } from 'rxjs'

export type SelectedPlan = 'free' | 'starter' | 'pro' | 'business'

type CreatedOrganization = {
  id: string
  name: string
}

@Component({
  selector: 'ri-organization-create-form',
  imports: [ButtonModule, FormField, InputTextModule],
  templateUrl: './organization-create-form.component.html',
})
export class OrganizationCreateFormComponent {
  private readonly organizations = inject(OrganizationService)

  readonly selectedPlan = input<SelectedPlan>('free')
  readonly submitLabel = input('Create Organization')
  readonly showInvitationHelp = input(true)
  readonly created = output<{ organizationId: string; selectedPlan: SelectedPlan }>()

  protected readonly errorMessage = signal<string | null>(null)
  protected readonly isSubmitting = signal(false)
  protected readonly canSubmit = computed(() => this.organizationForm().valid() && !this.isSubmitting())

  private readonly organizationModel = signal({
    name: '',
  })

  protected readonly organizationForm = form(this.organizationModel, (schema) => {
    required(schema.name)
  })

  protected createOrganization(event: Event): void {
    event.preventDefault()

    if (!this.canSubmit()) {
      this.organizationForm().markAsTouched()
      return
    }

    this.errorMessage.set(null)
    this.isSubmitting.set(true)

    submit(this.organizationForm, async () => {
      const value = this.organizationForm().value()

      try {
        const organization = (await firstValueFrom(
          this.organizations.create({
            name: value.name,
            slug: this.slugify(value.name),
          }),
        )) as CreatedOrganization

        await firstValueFrom(this.organizations.setActive({ organizationId: organization.id }))
        dispatchEvent(new CustomEvent('reviewinbox:organizations-changed'))
        this.created.emit({ organizationId: organization.id, selectedPlan: this.selectedPlan() })
      } catch {
        this.errorMessage.set('We could not create this Organization. Try another name or try again.')
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
}
