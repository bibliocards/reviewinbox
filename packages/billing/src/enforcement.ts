import { getEffectiveOrganizationLimits, type OrganizationLimitOverrides } from './limits'
import type { PlanName } from './plans'

export type LimitDeploymentMode = 'self-hosted' | 'cloud'

export type EnforcementReason =
  | 'app_limit_reached'
  | 'store_connection_limit_reached'
  | 'member_limit_reached'
  | 'monthly_review_import_cap_reached'
  | 'monthly_managed_ai_reply_draft_cap_reached'

export type EnforcementDecision =
  | { allowed: true; remaining: number | 'unlimited' }
  | { allowed: false; reason: EnforcementReason; remaining: 0 }

export type OrganizationLimitContext = {
  deploymentMode: LimitDeploymentMode
  planName: PlanName
  overrides?: OrganizationLimitOverrides
}

export function canCreateApp(context: OrganizationLimitContext, currentAppCount: number): EnforcementDecision {
  return enforceCountLimit(context, currentAppCount, 'appLimit', 'app_limit_reached')
}

export function canCreateStoreConnection(
  context: OrganizationLimitContext,
  currentStoreConnectionCount: number,
): EnforcementDecision {
  return enforceCountLimit(
    context,
    currentStoreConnectionCount,
    'storeConnectionLimit',
    'store_connection_limit_reached',
  )
}

export function canInviteMember(context: OrganizationLimitContext, currentMemberCount: number): EnforcementDecision {
  return enforceCountLimit(context, currentMemberCount, 'memberLimit', 'member_limit_reached')
}

export function canImportNewReview(
  context: OrganizationLimitContext,
  monthlyImportedReviewCount: number,
): EnforcementDecision {
  return enforceCountLimit(
    context,
    monthlyImportedReviewCount,
    'monthlyReviewImportCap',
    'monthly_review_import_cap_reached',
  )
}

export function canGenerateManagedAiReplyDraft(
  context: OrganizationLimitContext,
  monthlyManagedAiReplyDraftCount: number,
): EnforcementDecision {
  return enforceCountLimit(
    context,
    monthlyManagedAiReplyDraftCount,
    'monthlyManagedAiReplyDraftCap',
    'monthly_managed_ai_reply_draft_cap_reached',
  )
}

function enforceCountLimit(
  context: OrganizationLimitContext,
  currentCount: number,
  limitName: keyof ReturnType<typeof getEffectiveOrganizationLimits>,
  reason: EnforcementReason,
): EnforcementDecision {
  if (context.deploymentMode === 'self-hosted') {
    return { allowed: true, remaining: 'unlimited' }
  }

  const limits = getEffectiveOrganizationLimits(context.planName, context.overrides)
  const limit = limits[limitName]
  const remaining = Math.max(0, limit - currentCount)

  if (remaining < 1) {
    return { allowed: false, reason, remaining: 0 }
  }

  return { allowed: true, remaining }
}
