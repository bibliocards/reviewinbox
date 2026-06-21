import { Component, computed, HostListener, inject, signal } from '@angular/core'
import { FormField, form, required } from '@angular/forms/signals'
import { TranslocoDirective } from '@jsverse/transloco'
import type { OrganizationProfileResponse } from '@reviewinbox/contracts'
import { OrganizationService } from 'ngx-better-auth'
import { ButtonModule } from 'primeng/button'
import { InputTextModule } from 'primeng/inputtext'
import { finalize, of, switchMap } from 'rxjs'
import { OrganizationProfileService } from '../../../../shared/services/organization-profile.service'

@Component({
  selector: 'ri-organization-profile-page',
  imports: [ButtonModule, FormField, InputTextModule, TranslocoDirective],
  templateUrl: './organization-profile.page.html',
})
export class OrganizationProfilePageComponent {
  private readonly organizationProfile = inject(OrganizationProfileService)
  private readonly organizations = inject(OrganizationService)

  protected readonly profile = signal<OrganizationProfileResponse | null>(null)
  protected readonly errorMessageKey = signal<string | null>(null)
  protected readonly successMessageKey = signal<string | null>(null)
  protected readonly isLoading = signal(true)
  protected readonly isSaving = signal(false)
  protected readonly isUploadingLogo = signal(false)
  protected readonly isDeleting = signal(false)

  private readonly profileModel = signal({
    name: '',
    confirmationName: '',
  })

  protected readonly profileForm = form(this.profileModel, (schema) => {
    required(schema.name)
  })

  protected readonly initials = computed(() => this.initialsFrom(this.profile()?.name ?? this.profileForm().value().name))
  protected readonly hasNameChanges = computed(() => {
    const profile = this.profile()
    return Boolean(profile && this.profileForm().value().name.trim() !== profile.name)
  })
  protected readonly canSubmitDelete = computed(() => {
    const profile = this.profile()
    return Boolean(profile?.canDelete && profile.deletionAvailable && this.profileForm().value().confirmationName === profile.name)
  })

  constructor() {
    this.loadProfile()
  }

  @HostListener('window:reviewinbox:active-organization-changed')
  protected reloadForActiveOrganization(): void {
    this.errorMessageKey.set(null)
    this.successMessageKey.set(null)
    this.loadProfile()
  }

  protected saveProfile(event: Event): void {
    event.preventDefault()

    if (!this.profileForm().valid()) {
      this.profileForm().markAsTouched()
      return
    }

    this.errorMessageKey.set(null)
    this.successMessageKey.set(null)
    this.isSaving.set(true)

    const name = this.profileForm().value().name.trim()

    this.organizationProfile
      .updateProfile({ name })
      .pipe(finalize(() => this.isSaving.set(false)))
      .subscribe({
        next: (profile) => {
          this.setProfile(profile)
          this.successMessageKey.set('organization.profile.saved')
          this.notifyOrganizationsChanged()
        },
        error: () => this.errorMessageKey.set('organization.profile.errors.saveFailed'),
      })
  }

  protected uploadLogo(event: Event): void {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''

    if (!file) {
      return
    }

    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      this.errorMessageKey.set('organization.profile.errors.logoType')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      this.errorMessageKey.set('organization.profile.errors.logoSize')
      return
    }

    this.errorMessageKey.set(null)
    this.successMessageKey.set(null)
    this.isUploadingLogo.set(true)

    this.organizationProfile
      .uploadLogo(file)
      .pipe(finalize(() => this.isUploadingLogo.set(false)))
      .subscribe({
        next: (profile) => {
          this.setProfile(profile)
          this.successMessageKey.set('organization.profile.logoSaved')
          this.notifyOrganizationsChanged()
        },
        error: () => this.errorMessageKey.set('organization.profile.errors.logoFailed'),
      })
  }

  protected deleteOrganization(): void {
    const profile = this.profile()
    if (!profile || !this.canSubmitDelete()) {
      return
    }

    this.errorMessageKey.set(null)
    this.successMessageKey.set(null)
    this.isDeleting.set(true)

    this.organizationProfile
      .deleteOrganization({ name: profile.name })
      .pipe(
        switchMap((result) => {
          if (!result.nextOrganizationId) {
            return of(result)
          }

          return this.organizations.setActive({ organizationId: result.nextOrganizationId }).pipe(switchMap(() => of(result)))
        }),
        finalize(() => this.isDeleting.set(false)),
      )
      .subscribe({
        next: ({ nextOrganizationId }) => {
          this.notifyOrganizationsChanged()

          if (nextOrganizationId) {
            location.assign('/')
            return
          }

          location.assign('/organizations/new')
        },
        error: () => this.errorMessageKey.set('organization.profile.errors.deleteFailed'),
      })
  }

  private loadProfile(): void {
    this.isLoading.set(true)

    this.organizationProfile
      .getProfile()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (profile) => this.setProfile(profile),
        error: () => this.errorMessageKey.set('organization.profile.errors.loadFailed'),
      })
  }

  private setProfile(profile: OrganizationProfileResponse): void {
    this.profile.set(profile)
    this.profileModel.set({ name: profile.name, confirmationName: '' })
  }

  private initialsFrom(name: string): string {
    return name
      .split(/[ ._-]/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase()
  }

  private notifyOrganizationsChanged(): void {
    dispatchEvent(new CustomEvent('reviewinbox:organizations-changed'))
  }
}
