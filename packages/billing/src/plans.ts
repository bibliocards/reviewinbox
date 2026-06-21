export const planNames = ['free', 'starter', 'pro', 'business'] as const

export type PlanName = (typeof planNames)[number]

export type PlanLimits = {
  includedMembers: number
  memberLimit: number
  includedApps: number
  appLimit: number
  includedStoreConnections: number
  storeConnectionLimit: number
  includedMonthlyReviewImports: number
  monthlyReviewImportCap: number
  includedMonthlyManagedAiReplyDrafts: number
  monthlyManagedAiReplyDraftCap: number
}

export type PlanDefinition = PlanLimits & {
  name: PlanName
  allowBringYourOwnKey: boolean
  allowManualSync: boolean
  autoSyncIntervalHours: number
}

export const managedAiReplyDraftOveragePack = {
  size: 100,
  priceCents: 500,
} as const

export const reviewImportOveragePack = {
  size: 1_000,
  priceCents: 500,
} as const

export const extraMemberSeat = {
  priceCents: 500,
} as const

export const planDefinitions = {
  free: {
    name: 'free',
    includedMembers: 1,
    memberLimit: 1,
    includedApps: 1,
    appLimit: 1,
    includedStoreConnections: 2,
    storeConnectionLimit: 2,
    includedMonthlyReviewImports: 30,
    monthlyReviewImportCap: 30,
    includedMonthlyManagedAiReplyDrafts: 5,
    monthlyManagedAiReplyDraftCap: 5,
    allowBringYourOwnKey: false,
    allowManualSync: false,
    autoSyncIntervalHours: 24,
  },
  starter: {
    name: 'starter',
    includedMembers: 3,
    memberLimit: 3,
    includedApps: 2,
    appLimit: 2,
    includedStoreConnections: 4,
    storeConnectionLimit: 4,
    includedMonthlyReviewImports: 500,
    monthlyReviewImportCap: 500,
    includedMonthlyManagedAiReplyDrafts: 100,
    monthlyManagedAiReplyDraftCap: 100,
    allowBringYourOwnKey: true,
    allowManualSync: true,
    autoSyncIntervalHours: 6,
  },
  pro: {
    name: 'pro',
    includedMembers: 10,
    memberLimit: 10,
    includedApps: 10,
    appLimit: 10,
    includedStoreConnections: 20,
    storeConnectionLimit: 20,
    includedMonthlyReviewImports: 5_000,
    monthlyReviewImportCap: 5_000,
    includedMonthlyManagedAiReplyDrafts: 1_000,
    monthlyManagedAiReplyDraftCap: 1_000,
    allowBringYourOwnKey: true,
    allowManualSync: true,
    autoSyncIntervalHours: 6,
  },
  business: {
    name: 'business',
    includedMembers: 25,
    memberLimit: 25,
    includedApps: 50,
    appLimit: 100,
    includedStoreConnections: 100,
    storeConnectionLimit: 200,
    includedMonthlyReviewImports: 50_000,
    monthlyReviewImportCap: 50_000,
    includedMonthlyManagedAiReplyDrafts: 10_000,
    monthlyManagedAiReplyDraftCap: 10_000,
    allowBringYourOwnKey: true,
    allowManualSync: true,
    autoSyncIntervalHours: 6,
  },
} satisfies Record<PlanName, PlanDefinition>

export function getPlanDefinition(planName: PlanName): PlanDefinition {
  return planDefinitions[planName]
}
