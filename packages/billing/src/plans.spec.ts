import { describe, expect, it } from 'vitest'

import {
  extraMemberSeat,
  getPlanDefinition,
  managedAiReplyDraftOveragePack,
  reviewImportOveragePack,
} from './plans'

describe('plan definitions', () => {
  it('defines the free tier limits', () => {
    expect(getPlanDefinition('free')).toMatchObject({
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
    })
  })

  it('defines provisional paid plan limits', () => {
    expect(getPlanDefinition('starter')).toMatchObject({
      includedMembers: 3,
      includedApps: 2,
      includedStoreConnections: 4,
      includedMonthlyReviewImports: 500,
      includedMonthlyManagedAiReplyDrafts: 100,
    })
    expect(getPlanDefinition('pro')).toMatchObject({
      includedMembers: 10,
      includedApps: 10,
      includedStoreConnections: 20,
      includedMonthlyReviewImports: 5_000,
      includedMonthlyManagedAiReplyDrafts: 1_000,
    })
    expect(getPlanDefinition('business')).toMatchObject({
      includedMembers: 25,
      includedApps: 50,
      includedStoreConnections: 100,
      includedMonthlyReviewImports: 50_000,
      includedMonthlyManagedAiReplyDrafts: 10_000,
    })
  })

  it('keeps provisional overage pricing in packs', () => {
    expect(managedAiReplyDraftOveragePack).toEqual({ size: 100, priceCents: 500 })
    expect(reviewImportOveragePack).toEqual({ size: 1_000, priceCents: 500 })
    expect(extraMemberSeat).toEqual({ priceCents: 500 })
  })
})
