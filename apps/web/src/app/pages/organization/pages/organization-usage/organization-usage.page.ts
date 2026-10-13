import {
  Component,
  computed,
  HostListener,
  inject,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core'
import { RouterLink } from '@angular/router'
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco'
import type { OrganizationUsageItem, OrganizationUsageResponse } from '@reviewinbox/contracts'
import { ButtonModule } from 'primeng/button'
import { ProgressBarModule } from 'primeng/progressbar'

import { billingPlanLabels } from '../../../../shared/billing-plan-display'
import { OrganizationProfileService } from '../../../../shared/services/organization-profile.service'
import { OrganizationMembersPageComponent } from '../organization-members/organization-members.page'

type UsageCard = { key: string; upgradeReason: string; usage: OrganizationUsageItem }

@Component({
  selector: 'ri-organization-usage-page',
  imports: [
    ButtonModule,
    ProgressBarModule,
    RouterLink,
    TranslocoDirective,
    OrganizationMembersPageComponent,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: 'organization-usage.page.html',
})
export class OrganizationUsagePageComponent {
  private readonly organizationProfile = inject(OrganizationProfileService)
  private readonly transloco = inject(TranslocoService)

  protected readonly usage = signal<OrganizationUsageResponse | null>(null)
  protected readonly isLoading = signal(true)
  protected readonly errorMessage = signal<string | null>(null)
  protected readonly currentPlanLabel = computed(() => {
    const plan = this.usage()?.planName
    return plan === undefined || plan === 'free' ? 'Free' : billingPlanLabels[plan]
  })
  protected readonly usageItems = computed<UsageCard[]>(() => {
    const usage = this.usage()
    if (!usage) {
      return []
    }

    return [
      { key: 'members', upgradeReason: 'members-limit', usage: usage.usage.members },
      { key: 'apps', upgradeReason: 'apps-limit', usage: usage.usage.apps },
      {
        key: 'storeConnections',
        upgradeReason: 'store-connections-limit',
        usage: usage.usage.storeConnections,
      },
      {
        key: 'monthlyReviewImports',
        upgradeReason: 'review-imports-limit',
        usage: usage.usage.monthlyReviewImports,
      },
      {
        key: 'monthlyManagedAiReplyDrafts',
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
        this.errorMessage.set('organization.usage.loadFailed')
        this.isLoading.set(false)
      },
    })
  }

  protected meterTokens(usage: OrganizationUsageItem) {
    return {
      root: { height: '6px', background: 'var(--color-surface-3)' },
      value: { background: this.meterColor(usage) },
    }
  }

  protected formattedDate(value: string): string {
    return new Intl.DateTimeFormat(this.transloco.getActiveLang(), { dateStyle: 'medium' }).format(
      new Date(value),
    )
  }

  protected shouldShowUpgradeCta(usage: OrganizationUsageItem): boolean {
    const organizationUsage = this.usage()
    return (
      organizationUsage?.limitsEnforced === true
      && organizationUsage.planName === 'free'
      && usage.limit !== null
      && usage.severity !== 'ok'
    )
  }

  private meterColor(usage: OrganizationUsageItem): string {
    if (usage.severity === 'danger') {
      return 'var(--color-failure-ink)'
    }

    if (usage.severity === 'warning') {
      return 'var(--color-severity-minor)'
    }

    return 'var(--color-primary)'
  }
}
