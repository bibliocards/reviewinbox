import { getPlanDefinition, type PlanLimits, type PlanName } from './plans'

export type OrganizationLimitOverrides = Partial<PlanLimits>

export type EffectiveOrganizationLimits = PlanLimits

export function getEffectiveOrganizationLimits(
  planName: PlanName,
  overrides: OrganizationLimitOverrides = {},
): EffectiveOrganizationLimits {
  const plan = getPlanDefinition(planName)

  return {
    includedMembers: resolveLimit(overrides, plan, 'includedMembers'),
    memberLimit: resolveLimit(overrides, plan, 'memberLimit'),
    includedApps: resolveLimit(overrides, plan, 'includedApps'),
    appLimit: resolveLimit(overrides, plan, 'appLimit'),
    includedStoreConnections: resolveLimit(overrides, plan, 'includedStoreConnections'),
    storeConnectionLimit: resolveLimit(overrides, plan, 'storeConnectionLimit'),
    includedMonthlyReviewImports: resolveLimit(overrides, plan, 'includedMonthlyReviewImports'),
    monthlyReviewImportCap: resolveLimit(overrides, plan, 'monthlyReviewImportCap'),
    includedMonthlyManagedAiReplyDrafts: resolveLimit(
      overrides,
      plan,
      'includedMonthlyManagedAiReplyDrafts',
    ),
    monthlyManagedAiReplyDraftCap: resolveLimit(overrides, plan, 'monthlyManagedAiReplyDraftCap'),
  }
}

function resolveLimit(
  overrides: OrganizationLimitOverrides,
  plan: PlanLimits,
  key: keyof PlanLimits,
): number {
  return overrides[key] ?? plan[key]
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
