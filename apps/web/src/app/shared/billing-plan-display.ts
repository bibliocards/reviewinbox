import type { BillingPlanName } from '@reviewinbox/contracts'

export type PaidBillingPlanName = Exclude<BillingPlanName, 'free'>

export const billingPlanLabels: Record<PaidBillingPlanName, string> = {
  starter: 'Starter',
  pro: 'Pro',
  business: 'Business',
}

export const billingPlanPrices: Record<PaidBillingPlanName, { monthly: string; annual: string }> = {
  starter: { monthly: '$9.99 monthly', annual: '$99.99 yearly' },
  pro: { monthly: '$29.99 monthly', annual: '$299.99 yearly' },
  business: { monthly: '$99.99 monthly', annual: '$999.99 yearly' },
}

export const billingPlanSummaries: Record<PaidBillingPlanName, string> = {
  starter: 'For small teams getting Review Inbox under control.',
  pro: 'For growing app teams with more Apps, Reviews, and Reply Drafts.',
  business: 'For larger Organizations managing higher review volume.',
}

export const billingPlanHighlights: Record<PaidBillingPlanName, string[]> = {
  starter: ['3 members', '2 Apps', '500 Review imports / month', '100 managed AI Reply Drafts / month'],
  pro: ['10 members', '10 Apps', '5,000 Review imports / month', '1,000 managed AI Reply Drafts / month'],
  business: ['25 members included', '100 Apps limit', '50,000 Review imports / month', '10,000 managed AI Reply Drafts / month'],
}
