import { describe, expect, it } from 'vitest'

import { getEffectiveOrganizationLimits, getUsagePercent, getUsageSeverity } from './limits'

describe('getEffectiveOrganizationLimits', () => {
  it('uses plan limits by default', () => {
    expect(getEffectiveOrganizationLimits('free')).toMatchObject({
      monthlyReviewImportCap: 30,
      monthlyManagedAiReplyDraftCap: 5,
    })
  })

  it('allows owner caps or add-ons to override plan defaults', () => {
    expect(
      getEffectiveOrganizationLimits('starter', {
        memberLimit: 5,
        monthlyReviewImportCap: 1_500,
        monthlyManagedAiReplyDraftCap: 300,
      }),
    ).toMatchObject({
      includedMembers: 3,
      memberLimit: 5,
      includedMonthlyReviewImports: 500,
      monthlyReviewImportCap: 1_500,
      includedMonthlyManagedAiReplyDrafts: 100,
      monthlyManagedAiReplyDraftCap: 300,
    })
  })
})

describe('usage display helpers', () => {
  it('returns bounded integer percentages', () => {
    expect(getUsagePercent(7, 10)).toBe(70)
    expect(getUsagePercent(11, 10)).toBe(100)
  })

  it('maps usage to meter severities', () => {
    expect(getUsageSeverity(69, 100)).toBe('ok')
    expect(getUsageSeverity(70, 100)).toBe('warning')
    expect(getUsageSeverity(90, 100)).toBe('danger')
  })
})
