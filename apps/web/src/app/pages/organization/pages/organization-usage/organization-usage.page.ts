import { DatePipe } from '@angular/common'
import { Component, computed, HostListener, inject, signal } from '@angular/core'
import { RouterLink } from '@angular/router'
import type { OrganizationUsageItem, OrganizationUsageResponse } from '@reviewinbox/contracts'
import { ButtonModule } from 'primeng/button'
import { MeterGroupModule } from 'primeng/metergroup'
import { OrganizationProfileService } from '../../../../shared/services/organization-profile.service'

type UsageCard = {
  key: string
  label: string
  description: string
  upgradeReason: string
  usage: OrganizationUsageItem
}

@Component({
  selector: 'ri-organization-usage-page',
  imports: [ButtonModule, DatePipe, MeterGroupModule, RouterLink],
  templateUrl: 'organization-usage.page.html',
})
export class OrganizationUsagePageComponent {
  private readonly organizationProfile = inject(OrganizationProfileService)

  protected readonly usage = signal<OrganizationUsageResponse | null>(null)
  protected readonly isLoading = signal(true)
  protected readonly errorMessage = signal<string | null>(null)
  protected readonly usageItems = computed<UsageCard[]>(() => {
    const usage = this.usage()
    if (!usage) {
      return []
    }

    return [
      {
        key: 'members',
        label: 'Members',
        description: 'People who can access this Organization.',
        upgradeReason: 'members-limit',
        usage: usage.usage.members,
      },
      {
        key: 'apps',
        label: 'Apps',
        description: 'Mobile Apps tracked in ReviewInbox.',
        upgradeReason: 'apps-limit',
        usage: usage.usage.apps,
      },
      {
        key: 'storeConnections',
        label: 'Store Connections',
        description: 'Apple App Store and Google Play connections.',
        upgradeReason: 'store-connections-limit',
        usage: usage.usage.storeConnections,
      },
      {
        key: 'monthlyReviewImports',
        label: 'Monthly Review imports',
        description: 'New Reviews imported for this usage period.',
        upgradeReason: 'review-imports-limit',
        usage: usage.usage.monthlyReviewImports,
      },
      {
        key: 'monthlyManagedAiReplyDrafts',
        label: 'Managed AI Reply Drafts',
        description: 'Reply Drafts generated with ReviewInbox managed AI.',
        upgradeReason: 'reply-drafts-limit',
        usage: usage.usage.monthlyManagedAiReplyDrafts,
      },
    ]
  })

  constructor() {
    this.loadUsage()
  }

  @HostListener('window:reviewinbox:active-organization-changed')
  protected reloadForActiveOrganization(): void {
    this.loadUsage()
  }

  protected loadUsage(): void {
    this.isLoading.set(true)
    this.errorMessage.set(null)

    this.organizationProfile.getUsage().subscribe({
      next: (usage) => {
        this.usage.set(usage)
        this.isLoading.set(false)
      },
      error: () => {
        this.errorMessage.set('We could not load Organization usage. Please try again.')
        this.isLoading.set(false)
      },
    })
  }

  protected meterValue(usage: OrganizationUsageItem) {
    return [
      {
        label: `${usage.used} of ${usage.limit} used. Included: ${usage.included}.`,
        value: usage.percent ?? 0,
        color: this.meterColor(usage),
      },
    ]
  }

  protected meterAriaLabel(label: string, usage: OrganizationUsageItem): string {
    return `${label} usage: ${usage.used} of ${usage.limit ?? 'unlimited'} used`
  }

  protected shouldShowUpgradeCta(usage: OrganizationUsageItem): boolean {
    const organizationUsage = this.usage()
    return (
      organizationUsage?.limitsEnforced === true && organizationUsage.planName === 'free' && usage.limit !== null && usage.severity !== 'ok'
    )
  }

  private meterColor(usage: OrganizationUsageItem): string {
    if (usage.severity === 'danger') {
      return '#dc2626'
    }

    if (usage.severity === 'warning') {
      return '#d97706'
    }

    return '#16a34a'
  }
}
