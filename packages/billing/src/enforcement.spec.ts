import { describe, expect, it } from 'vitest'

import {
  canCreateApp,
  canCreateStoreConnection,
  canGenerateManagedAiReplyDraft,
  canImportNewReview,
  canInviteMember,
  type OrganizationLimitContext,
} from './enforcement'

const freeCloudContext: OrganizationLimitContext = {
  deploymentMode: 'cloud',
  planName: 'free',
}

describe('cloud enforcement', () => {
  it('blocks structural actions when free tier limits are reached', () => {
    expect(canCreateApp(freeCloudContext, 1)).toEqual({ allowed: false, reason: 'app_limit_reached', remaining: 0 })
    expect(canCreateStoreConnection(freeCloudContext, 2)).toEqual({
      allowed: false,
      reason: 'store_connection_limit_reached',
      remaining: 0,
    })
    expect(canInviteMember(freeCloudContext, 1)).toEqual({
      allowed: false,
      reason: 'member_limit_reached',
      remaining: 0,
    })
  })

  it('allows structural actions while under free tier limits', () => {
    expect(canCreateApp(freeCloudContext, 0)).toEqual({ allowed: true, remaining: 1 })
    expect(canCreateStoreConnection(freeCloudContext, 1)).toEqual({ allowed: true, remaining: 1 })
    expect(canInviteMember(freeCloudContext, 0)).toEqual({ allowed: true, remaining: 1 })
  })

  it('blocks only new review imports after the monthly cap', () => {
    expect(canImportNewReview(freeCloudContext, 29)).toEqual({ allowed: true, remaining: 1 })
    expect(canImportNewReview(freeCloudContext, 30)).toEqual({
      allowed: false,
      reason: 'monthly_review_import_cap_reached',
      remaining: 0,
    })
  })

  it('blocks managed AI reply draft generation after the monthly cap', () => {
    expect(canGenerateManagedAiReplyDraft(freeCloudContext, 4)).toEqual({ allowed: true, remaining: 1 })
    expect(canGenerateManagedAiReplyDraft(freeCloudContext, 5)).toEqual({
      allowed: false,
      reason: 'monthly_managed_ai_reply_draft_cap_reached',
      remaining: 0,
    })
  })

  it('uses owner caps when present', () => {
    const context: OrganizationLimitContext = {
      deploymentMode: 'cloud',
      planName: 'starter',
      overrides: {
        monthlyManagedAiReplyDraftCap: 300,
      },
    }

    expect(canGenerateManagedAiReplyDraft(context, 299)).toEqual({ allowed: true, remaining: 1 })
    expect(canGenerateManagedAiReplyDraft(context, 300)).toEqual({
      allowed: false,
      reason: 'monthly_managed_ai_reply_draft_cap_reached',
      remaining: 0,
    })
  })
})

describe('self-hosted enforcement', () => {
  it('does not enforce billing limits', () => {
    const context: OrganizationLimitContext = {
      deploymentMode: 'self-hosted',
      planName: 'free',
    }

    expect(canCreateApp(context, 999)).toEqual({ allowed: true, remaining: 'unlimited' })
    expect(canImportNewReview(context, 999)).toEqual({ allowed: true, remaining: 'unlimited' })
    expect(canGenerateManagedAiReplyDraft(context, 999)).toEqual({ allowed: true, remaining: 'unlimited' })
  })
})
