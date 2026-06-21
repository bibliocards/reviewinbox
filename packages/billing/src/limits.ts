import { getPlanDefinition, type PlanLimits, type PlanName } from './plans'

export type OrganizationLimitOverrides = Partial<PlanLimits>

export type EffectiveOrganizationLimits = PlanLimits

export function getEffectiveOrganizationLimits(
  planName: PlanName,
  overrides: OrganizationLimitOverrides = {},
): EffectiveOrganizationLimits {
  const plan = getPlanDefinition(planName)

  return {
    includedMembers: overrides.includedMembers ?? plan.includedMembers,
    memberLimit: overrides.memberLimit ?? plan.memberLimit,
    includedApps: overrides.includedApps ?? plan.includedApps,
    appLimit: overrides.appLimit ?? plan.appLimit,
    includedStoreConnections: overrides.includedStoreConnections ?? plan.includedStoreConnections,
    storeConnectionLimit: overrides.storeConnectionLimit ?? plan.storeConnectionLimit,
    includedMonthlyReviewImports: overrides.includedMonthlyReviewImports ?? plan.includedMonthlyReviewImports,
    monthlyReviewImportCap: overrides.monthlyReviewImportCap ?? plan.monthlyReviewImportCap,
    includedMonthlyManagedAiReplyDrafts:
      overrides.includedMonthlyManagedAiReplyDrafts ?? plan.includedMonthlyManagedAiReplyDrafts,
    monthlyManagedAiReplyDraftCap: overrides.monthlyManagedAiReplyDraftCap ?? plan.monthlyManagedAiReplyDraftCap,
  }
}

export function getUsagePercent(used: number, limit: number): number {
  if (limit <= 0) {
    return used > 0 ? 100 : 0
  }

  return Math.min(100, Math.round((used / limit) * 100))
}

export function getUsageSeverity(used: number, limit: number): 'ok' | 'warning' | 'danger' {
  const percent = getUsagePercent(used, limit)

  if (percent >= 90) {
    return 'danger'
  }

  if (percent >= 70) {
    return 'warning'
  }

  return 'ok'
}
