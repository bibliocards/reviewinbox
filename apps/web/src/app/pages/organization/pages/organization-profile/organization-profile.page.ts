import { HttpErrorResponse } from '@angular/common/http'
import {
  Component,
  computed,
  HostListener,
  inject,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core'
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
  changeDetection: ChangeDetectionStrategy.Eager,
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

  private readonly profileModel = signal({ name: '', confirmationName: '' })

  protected readonly profileForm = form(this.profileModel, (schema) => {
    required(schema.name)
  })

  protected readonly initials = computed(() =>
    this.initialsFrom(this.profile()?.name ?? this.profileForm().value().name),
  )
  protected readonly hasNameChanges = computed(() => {
    const profile = this.profile()
    return Boolean(profile && this.profileForm().value().name.trim() !== profile.name)
  })
  protected readonly canSubmitDelete = computed(() => {
    const profile = this.profile()
    return (
      profile !== null
      && profile.canDelete
      && profile.deletionAvailable
      && this.profileForm().value().confirmationName === profile.name
    )
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
      .pipe(
        finalize(() => {
          this.isSaving.set(false)
        }),
      )
      .subscribe({
        next: (profile) => {
          this.setProfile(profile)
          this.successMessageKey.set('organization.profile.saved')
          this.notifyOrganizationsChanged()
        },
        error: () => {
          this.errorMessageKey.set('organization.profile.errors.saveFailed')
        },
      })
  }

  protected uploadLogo(event: Event): void {
    const file = this.logoFileFromEvent(event)
    if (file === null) {
      return
    }

    const validationError = this.logoValidationError(file)
    if (validationError !== null) {
      this.errorMessageKey.set(validationError)
      return
    }

    this.prepareLogoUpload()

    this.organizationProfile
      .uploadLogo(file)
      .pipe(
        finalize(() => {
          this.isUploadingLogo.set(false)
        }),
      )
      .subscribe({
        next: (profile) => {
          this.setProfile(profile)
          this.successMessageKey.set('organization.profile.logoSaved')
          this.notifyOrganizationsChanged()
        },
        error: () => {
          this.errorMessageKey.set('organization.profile.errors.logoFailed')
        },
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
          if (result.nextOrganizationId === null || result.nextOrganizationId === '') {
            return of(result)
          }

          return this.organizations
            .setActive({ organizationId: result.nextOrganizationId })
            .pipe(switchMap(() => of(result)))
        }),
        finalize(() => {
          this.isDeleting.set(false)
        }),
      )
      .subscribe({
        next: ({ nextOrganizationId }) => {
          this.notifyOrganizationsChanged()

          if (nextOrganizationId !== null && nextOrganizationId !== '') {
            location.assign('/')
            return
          }

          location.assign('/organizations/new')
        },
        error: (error: HttpErrorResponse) => {
          this.errorMessageKey.set(this.deleteOrganizationErrorKey(error))
        },
      })
  }

  private deleteOrganizationErrorKey(error: HttpErrorResponse): string {
    if (error instanceof HttpErrorResponse && error.status === 409) {
      return 'organization.profile.errors.activeSubscription'
    }

    return 'organization.profile.errors.deleteFailed'
  }

  private loadProfile(): void {
    this.isLoading.set(true)

    this.organizationProfile
      .getProfile()
      .pipe(
        finalize(() => {
          this.isLoading.set(false)
        }),
      )
      .subscribe({
        next: (profile) => {
          this.setProfile(profile)
        },
        error: () => {
          this.errorMessageKey.set('organization.profile.errors.loadFailed')
        },
      })
  }

  private setProfile(profile: OrganizationProfileResponse): void {
    this.profile.set(profile)
    this.profileModel.set({ name: profile.name, confirmationName: '' })
  }

  private logoValidationError(file: File): string | null {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      return 'organization.profile.errors.logoType'
    }

    if (file.size > 5 * 1024 * 1024) {
      return 'organization.profile.errors.logoSize'
    }

    return null
  }

  private logoFileFromEvent(event: Event): File | null {
    if (!(event.target instanceof HTMLInputElement)) {
      return null
    }

    const file = event.target.files?.[0] ?? null
    event.target.value = ''
    return file
  }

  private prepareLogoUpload(): void {
    this.errorMessageKey.set(null)
    this.successMessageKey.set(null)
    this.isUploadingLogo.set(true)
  }

  private initialsFrom(name: string): string {
    return name
      .split(/[ ._-]/u)
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
