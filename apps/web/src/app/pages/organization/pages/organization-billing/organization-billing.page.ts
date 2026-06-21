import { DatePipe } from '@angular/common'
import { Component, computed, inject, signal } from '@angular/core'
import type { OrganizationUsageItem, OrganizationUsageResponse } from '@reviewinbox/contracts'
import { MeterGroupModule } from 'primeng/metergroup'
import { OrganizationProfileService } from '../../../../shared/services/organization-profile.service'

@Component({
  selector: 'ri-organization-billing-page',
  imports: [DatePipe, MeterGroupModule],
  templateUrl: 'organization-billing.page.html',
})
export class OrganizationBillingPageComponent {
  private readonly organizationProfile = inject(OrganizationProfileService)

  protected readonly usage = signal<OrganizationUsageResponse | null>(null)
  protected readonly isLoading = signal(true)
  protected readonly errorMessage = signal<string | null>(null)
  protected readonly usageItems = computed(() => {
    const usage = this.usage()
    if (!usage) {
      return []
    }

    return [
      {
        key: 'members',
        label: 'Members',
        description: 'People who can access this Organization.',
        usage: usage.usage.members,
      },
      {
        key: 'apps',
        label: 'Apps',
        description: 'Mobile Apps tracked in ReviewInbox.',
        usage: usage.usage.apps,
      },
      {
        key: 'storeConnections',
        label: 'Store Connections',
        description: 'Apple App Store and Google Play connections.',
        usage: usage.usage.storeConnections,
      },
      {
        key: 'monthlyReviewImports',
        label: 'Monthly Review imports',
        description: 'New Reviews imported for this usage period.',
        usage: usage.usage.monthlyReviewImports,
      },
      {
        key: 'monthlyManagedAiReplyDrafts',
        label: 'Managed AI Reply Drafts',
        description: 'Reply Drafts generated with ReviewInbox managed AI.',
        usage: usage.usage.monthlyManagedAiReplyDrafts,
      },
    ]
  })

  constructor() {
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
        label: `${usage.percent ?? 0}%`,
        value: usage.percent ?? 0,
        color: this.meterColor(usage),
      },
    ]
  }

  protected usageLabel(usage: OrganizationUsageItem): string {
    if (usage.limit === null) {
      return `${usage.used} used`
    }

    return `${usage.used}/${usage.limit}`
  }

  protected statusLabel(usage: OrganizationUsageItem): string {
    if (usage.severity === 'danger') {
      return ' · Limit reached'
    }

    if (usage.severity === 'warning') {
      return ' · Near limit'
    }

    return ''
  }

  protected meterAriaLabel(label: string, usage: OrganizationUsageItem): string {
    return `${label} usage: ${usage.used} of ${usage.limit ?? 'unlimited'} used`
  }

  protected planLabel(): string {
    const usage = this.usage()
    if (!usage) {
      return 'Loading usage...'
    }

    if (!usage.limitsEnforced) {
      return 'Self-hosted'
    }

    return usage.planName
  }

  protected badgeClass(usage: OrganizationUsageItem): string {
    if (usage.severity === 'danger') {
      return 'bg-red-500/10 text-red-700'
    }

    if (usage.severity === 'warning') {
      return 'bg-amber-500/10 text-amber-700'
    }

    return 'bg-green-500/10 text-green-700'
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
