import { Component, computed, DestroyRef, HostListener, inject, signal } from '@angular/core'
import { ActivatedRoute } from '@angular/router'
import type { OrganizationUsageResponse } from '@reviewinbox/contracts'
import { AuthService, StripeService } from 'ngx-better-auth'
import { ButtonModule } from 'primeng/button'
import { firstValueFrom } from 'rxjs'
import {
  billingPlanHighlights,
  billingPlanLabels,
  billingPlanPrices,
  billingPlanSummaries,
  type PaidBillingPlanName,
} from '../../../../shared/billing-plan-display'
import { AuthCapabilitiesService } from '../../../../shared/services/auth-capabilities.service'
import { OrganizationProfileService } from '../../../../shared/services/organization-profile.service'

type BillingInterval = 'monthly' | 'annual'

@Component({
  selector: 'ri-organization-billing-page',
  imports: [ButtonModule],
  templateUrl: 'organization-billing.page.html',
})
export class OrganizationBillingPageComponent {
  private readonly auth = inject(AuthService)
  private readonly authCapabilities = inject(AuthCapabilitiesService)
  private readonly destroyRef = inject(DestroyRef)
  private readonly organizationProfile = inject(OrganizationProfileService)
  private readonly route = inject(ActivatedRoute)
  private readonly stripe = inject(StripeService)
  private confirmationTimer: ReturnType<typeof setTimeout> | null = null

  protected readonly usage = signal<OrganizationUsageResponse | null>(null)
  protected readonly isLoading = signal(true)
  protected readonly isStartingCheckout = signal(false)
  protected readonly isOpeningPortal = signal(false)
  protected readonly isConfirmingCheckout = signal(false)
  protected readonly errorMessage = signal<string | null>(null)
  protected readonly billingMessage = signal<string | null>(null)
  protected readonly billingError = signal<string | null>(null)
  protected readonly checkoutPlan = signal<PaidBillingPlanName | null>(
    this.parseCheckoutPlan(this.route.snapshot.queryParamMap.get('plan')),
  )
  protected readonly billingInterval = signal<BillingInterval>('monthly')
  protected readonly requestedReason = signal(this.route.snapshot.queryParamMap.get('reason'))
  protected readonly availableBillingPlans = computed(() => this.authCapabilities.capabilities().availableBillingPlans)
  protected readonly billingPlanCards = computed(() =>
    this.availableBillingPlans().map((plan) => ({
      name: plan,
      label: billingPlanLabels[plan],
      summary: billingPlanSummaries[plan],
      price: this.billingInterval() === 'annual' ? billingPlanPrices[plan].annual : billingPlanPrices[plan].monthly,
      subprice: this.billingInterval() === 'annual' ? '2 months free' : 'Switch to annual later',
      highlights: billingPlanHighlights[plan],
      selected: this.selectedCheckoutPlan() === plan,
    })),
  )
  protected readonly currentPlanLabel = computed(() => {
    const plan = this.usage()?.planName
    if (!plan || plan === 'free') {
      return 'Free'
    }

    return billingPlanLabels[plan]
  })
  protected readonly reasonMessage = computed(() => {
    switch (this.requestedReason()) {
      case 'members-limit':
        return 'Your Organization is close to its member limit. Compare plans to add room for the team.'
      case 'apps-limit':
        return 'Your Organization is close to its App limit. Compare plans to track more Apps.'
      case 'store-connections-limit':
        return 'Your Organization is close to its Store Connection limit. Compare plans to connect more stores.'
      case 'review-imports-limit':
        return 'Your Organization is close to its monthly Review import limit. Compare plans to keep imports running.'
      case 'reply-drafts-limit':
        return 'Your Organization is close to its managed AI Reply Draft limit. Compare plans to draft more replies.'
      default:
        return 'Compare available plans for this Organization.'
    }
  })
  protected readonly unavailablePlanMessage = computed(() => {
    const requestedPlan = this.checkoutPlan()
    if (requestedPlan && !this.availableBillingPlans().includes(requestedPlan)) {
      return `${billingPlanLabels[requestedPlan]} is not available in this environment.`
    }

    return null
  })

  constructor() {
    this.loadUsage()
    this.billingMessage.set(this.checkoutMessageFromQuery(this.route.snapshot.queryParamMap.get('checkout')))

    if (this.route.snapshot.queryParamMap.get('checkout') === 'success') {
      this.startCheckoutConfirmation()
    }

    this.destroyRef.onDestroy(() => this.clearConfirmationTimer())
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
        this.errorMessage.set('We could not load Organization billing. Please try again.')
        this.isLoading.set(false)
      },
    })
  }

  protected selectBillingInterval(interval: BillingInterval): void {
    this.billingInterval.set(interval)
  }

  protected selectCheckoutPlan(plan: PaidBillingPlanName): void {
    this.checkoutPlan.set(plan)
  }

  protected async continueBillingSetup(plan: PaidBillingPlanName): Promise<void> {
    this.checkoutPlan.set(plan)

    const organizationId = this.activeOrganizationId()
    if (!organizationId) {
      this.billingMessage.set('Choose an active Organization before starting billing setup.')
      return
    }

    this.isStartingCheckout.set(true)
    this.billingMessage.set(null)
    this.billingError.set(null)

    try {
      const response = await firstValueFrom(
        this.stripe.upgrade({
          plan,
          annual: this.billingInterval() === 'annual',
          customerType: 'organization',
          referenceId: organizationId,
          successUrl: this.billingReturnUrl(`/organization/billing?plan=${plan}&checkout=success`),
          cancelUrl: this.billingReturnUrl(`/organization/billing?plan=${plan}&checkout=canceled`),
          returnUrl: this.billingReturnUrl('/organization/billing'),
        }),
      )

      if (response.url) {
        globalThis.location.assign(response.url)
        return
      }

      this.billingError.set('Stripe did not return a checkout URL. Please try again.')
    } catch {
      this.billingError.set('We could not start billing setup. Please try again.')
    } finally {
      this.isStartingCheckout.set(false)
    }
  }

  protected async openBillingPortal(): Promise<void> {
    const organizationId = this.activeOrganizationId()
    if (!organizationId) {
      this.billingMessage.set('Choose an active Organization before managing billing.')
      return
    }

    this.isOpeningPortal.set(true)
    this.billingMessage.set('Opening Stripe billing portal...')
    this.billingError.set(null)

    try {
      const response = await firstValueFrom(
        this.stripe.billingPortal({
          customerType: 'organization',
          referenceId: organizationId,
          returnUrl: this.billingReturnUrl('/organization/billing'),
        }),
      )

      if (response.url) {
        globalThis.location.assign(response.url)
        return
      }

      this.billingError.set('Stripe did not return a billing portal URL. Please try again.')
    } catch {
      this.billingError.set('We could not open the billing portal. Please try again.')
    } finally {
      this.isOpeningPortal.set(false)
    }
  }

  protected isCurrentPlan(plan: PaidBillingPlanName): boolean {
    return this.usage()?.planName === plan
  }

  protected planCardClass(selected: boolean): string {
    return selected ? 'border-primary bg-surface-2' : 'border-hairline bg-surface-1'
  }

  private startCheckoutConfirmation(): void {
    this.isConfirmingCheckout.set(true)
    this.pollCheckoutConfirmation(0)
  }

  private pollCheckoutConfirmation(attempt: number): void {
    this.clearConfirmationTimer()
    this.confirmationTimer = setTimeout(async () => {
      try {
        const usage = await firstValueFrom(this.organizationProfile.getUsage())
        this.usage.set(usage)

        if (usage.limitsEnforced && usage.planName !== 'free') {
          this.isConfirmingCheckout.set(false)
          this.billingMessage.set('Your subscription is active.')
          return
        }
      } catch {
        // Keep the optimistic pending state; the normal retry action remains available.
      }

      if (attempt >= 9) {
        this.isConfirmingCheckout.set(false)
        this.billingMessage.set('Activation is still in progress. You can keep using ReviewInbox while Stripe confirms the subscription.')
        return
      }

      this.pollCheckoutConfirmation(attempt + 1)
    }, 2_000)
  }

  private clearConfirmationTimer(): void {
    if (this.confirmationTimer) {
      clearTimeout(this.confirmationTimer)
      this.confirmationTimer = null
    }
  }

  private activeOrganizationId(): string | undefined {
    return (this.auth.session()?.session as { activeOrganizationId?: string } | undefined)?.activeOrganizationId
  }

  private parseCheckoutPlan(plan: string | null): PaidBillingPlanName | null {
    if (plan === 'starter' || plan === 'pro' || plan === 'business') {
      return plan
    }

    return null
  }

  private checkoutMessageFromQuery(checkout: string | null): string | null {
    if (checkout === 'canceled') {
      return 'Billing setup was canceled. You can continue when you are ready.'
    }

    if (checkout === 'success') {
      return 'Activation is in progress. Stripe is confirming the subscription.'
    }

    return null
  }

  private selectedCheckoutPlan(): PaidBillingPlanName | null {
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
