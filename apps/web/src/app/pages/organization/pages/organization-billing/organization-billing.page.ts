import { DatePipe } from '@angular/common'
import { Component, computed, HostListener, inject, signal } from '@angular/core'
import { ActivatedRoute } from '@angular/router'
import type { BillingPlanName, OrganizationUsageItem, OrganizationUsageResponse } from '@reviewinbox/contracts'
import { AuthService, StripeService } from 'ngx-better-auth'
import { ButtonModule } from 'primeng/button'
import { MeterGroupModule } from 'primeng/metergroup'
import { firstValueFrom } from 'rxjs'
import { AuthCapabilitiesService } from '../../../../shared/services/auth-capabilities.service'
import { OrganizationProfileService } from '../../../../shared/services/organization-profile.service'

type PaidPlanName = Exclude<BillingPlanName, 'free'>
type BillingInterval = 'monthly' | 'annual'

@Component({
  selector: 'ri-organization-billing-page',
  imports: [ButtonModule, DatePipe, MeterGroupModule],
  templateUrl: 'organization-billing.page.html',
})
export class OrganizationBillingPageComponent {
  private readonly auth = inject(AuthService)
  private readonly authCapabilities = inject(AuthCapabilitiesService)
  private readonly organizationProfile = inject(OrganizationProfileService)
  private readonly route = inject(ActivatedRoute)
  private readonly stripe = inject(StripeService)

  protected readonly usage = signal<OrganizationUsageResponse | null>(null)
  protected readonly isLoading = signal(true)
  protected readonly isStartingCheckout = signal(false)
  protected readonly errorMessage = signal<string | null>(null)
  protected readonly checkoutMessage = signal<string | null>(null)
  protected readonly checkoutPlan = signal<PaidPlanName | null>(this.parseCheckoutPlan(this.route.snapshot.queryParamMap.get('plan')))
  protected readonly billingInterval = signal<BillingInterval>('monthly')
  protected readonly availableBillingPlans = computed(() => this.authCapabilities.capabilities().availableBillingPlans)
  protected readonly billingSetupAvailable = computed(() => {
    const usage = this.usage()
    return usage?.limitsEnforced === true && usage.planName === 'free' && this.availableBillingPlans().length > 0
  })
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
  protected readonly checkoutPlanLabel = computed(() => {
    const plan = this.selectedCheckoutPlan()
    return plan ? planLabels[plan] : ''
  })
  protected readonly monthlyPriceLabel = computed(() => {
    const plan = this.selectedCheckoutPlan()
    return plan ? `${planPrices[plan].monthly}. You can switch to annual later.` : ''
  })
  protected readonly annualSavingsLabel = computed(() => {
    const plan = this.selectedCheckoutPlan()
    if (!plan) {
      return ''
    }

    return `${planPrices[plan].annual} yearly, 2 months free`
  })

  constructor() {
    this.loadUsage()
    this.checkoutMessage.set(this.checkoutMessageFromQuery(this.route.snapshot.queryParamMap.get('checkout')))
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

  protected selectBillingInterval(interval: BillingInterval): void {
    this.billingInterval.set(interval)
  }

  protected selectCheckoutPlan(plan: PaidPlanName): void {
    this.checkoutPlan.set(plan)
  }

  protected planOptionLabel(plan: PaidPlanName): string {
    return planLabels[plan]
  }

  protected isCheckoutPlanSelected(plan: PaidPlanName): boolean {
    return this.selectedCheckoutPlan() === plan
  }

  protected async continueBillingSetup(): Promise<void> {
    const plan = this.selectedCheckoutPlan()
    if (!plan) {
      this.checkoutMessage.set('No paid plan is configured yet.')
      return
    }

    const organizationId = (this.auth.session()?.session as { activeOrganizationId?: string } | undefined)?.activeOrganizationId
    if (!organizationId) {
      this.checkoutMessage.set('Choose an active Organization before starting billing setup.')
      return
    }

    this.isStartingCheckout.set(true)
    this.checkoutMessage.set(null)

    try {
      const response = await firstValueFrom(
        this.stripe.upgrade({
          plan,
          annual: this.billingInterval() === 'annual',
          customerType: 'organization',
          referenceId: organizationId,
          successUrl: this.billingReturnUrl('/organization/usage?checkout=success'),
          cancelUrl: this.billingReturnUrl(`/organization/usage?plan=${plan}&checkout=canceled`),
          returnUrl: this.billingReturnUrl('/organization/usage'),
        }),
      )

      if (response.url) {
        globalThis.location.assign(response.url)
        return
      }

      this.checkoutMessage.set('Stripe did not return a checkout URL. Please try again.')
    } catch {
      this.checkoutMessage.set('We could not start billing setup. Please try again.')
    } finally {
      this.isStartingCheckout.set(false)
    }
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

  private parseCheckoutPlan(plan: string | null): PaidPlanName | null {
    if (plan === 'starter' || plan === 'pro' || plan === 'business') {
      return plan
    }

    return null
  }

  private checkoutMessageFromQuery(checkout: string | null): string | null {
    if (checkout === 'pending') {
      return 'Create your subscription to activate the selected plan.'
    }

    if (checkout === 'canceled') {
      return 'Billing setup was canceled. You can continue when you are ready.'
    }

    if (checkout === 'success') {
      return 'Billing setup is complete. Usage limits will update after Stripe confirms the subscription.'
    }

    return null
  }

  private selectedCheckoutPlan(): PaidPlanName | null {
    const selectedPlan = this.checkoutPlan()
    const availablePlans = this.availableBillingPlans()
    if (selectedPlan && availablePlans.includes(selectedPlan)) {
      return selectedPlan
    }

    return availablePlans[0] ?? null
  }

  private billingReturnUrl(path: string): string {
    return new URL(path, this.authCapabilities.capabilities().appPublicUrl).toString()
  }
}

const planLabels: Record<PaidPlanName, string> = {
  starter: 'Starter',
  pro: 'Pro',
  business: 'Business',
}

const planPrices: Record<PaidPlanName, { monthly: string; annual: string }> = {
  starter: { monthly: '$9.99 monthly', annual: '$99.99' },
  pro: { monthly: '$29.99 monthly', annual: '$299.99' },
  business: { monthly: '$99.99 monthly', annual: '$999.99' },
}
