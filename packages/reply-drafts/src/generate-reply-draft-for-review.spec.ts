import { AiDraftingError } from '@reviewinbox/ai'
import { describe, expect, it, vi } from 'vitest'

import {
  generateReplyDraftForReview,
  type GenerateReplyDraftForReviewInput,
  type ReplyDraftGenerationTransaction,
} from './generate-reply-draft-for-review'

type DraftableReview = Parameters<ReplyDraftGenerationTransaction['selectLatestDraftableReview']>[0]
type DraftGenerator = GenerateReplyDraftForReviewInput['generateDraft']

const reviewRow: DraftableReview = {
  review: {
    id: 'review-1',
    organizationId: 'org-1',
    appId: 'app-1',
    storeConnectionId: 'connection-1',
    replyStatus: 'pending',
    body: 'Great app',
    rating: 5,
    title: null,
    locale: 'en-US',
    language: 'en',
  },
  app: {
    id: 'app-1',
    autoDraftEnabled: true,
    name: 'ReviewInbox',
    replyContext: '',
    defaultLanguage: 'en',
    mappedLanguages: [],
  },
  storeConnection: { id: 'connection-1', status: 'active', provider: 'apple_app_store' },
  replyDraft: null,
}

const generatedDraft = {
  draftText: 'Thanks for your review.',
  detectedReviewLanguage: 'en',
  chosenReplyLanguage: 'en',
  model: 'test-model',
  promptVersion: 'test-prompt',
}

function createDraftGenerator() {
  return vi.fn<DraftGenerator>().mockResolvedValue(generatedDraft)
}

function createTransaction(allowed = true) {
  return {
    lockUsagePeriod: vi
      .fn<ReplyDraftGenerationTransaction['lockUsagePeriod']>()
      .mockResolvedValue(),
    selectDraftableReview: vi
      .fn<ReplyDraftGenerationTransaction['selectDraftableReview']>()
      .mockResolvedValue(reviewRow),
    canGenerateCloudAiReplyDraftForOrganization: vi
      .fn<ReplyDraftGenerationTransaction['canGenerateCloudAiReplyDraftForOrganization']>()
      .mockResolvedValue({ allowed }),
    selectLatestDraftableReview: vi
      .fn<ReplyDraftGenerationTransaction['selectLatestDraftableReview']>()
      .mockResolvedValue(reviewRow),
    updateReviewWithDraft: vi
      .fn<ReplyDraftGenerationTransaction['updateReviewWithDraft']>()
      .mockResolvedValue({ id: 'review-1', organizationId: 'org-1', appId: 'app-1' }),
    insertGeneratedDraft: vi
      .fn<ReplyDraftGenerationTransaction['insertGeneratedDraft']>()
      .mockResolvedValue({ id: 'draft-1' }),
    recordManagedDraftUsage: vi
      .fn<ReplyDraftGenerationTransaction['recordManagedDraftUsage']>()
      .mockResolvedValue(),
    recordDraftFailure: vi
      .fn<ReplyDraftGenerationTransaction['recordDraftFailure']>()
      .mockResolvedValue(),
  } satisfies ReplyDraftGenerationTransaction
}

describe('generateReplyDraftForReview', () => {
  it('meters a successful Cloud OpenAI-compatible generation', async () => {
    const transaction = createTransaction()
    const generateDraft = createDraftGenerator()

    const result = await generateReplyDraftForReview({
      transaction,
      organizationId: 'org-1',
      reviewId: 'review-1',
      deploymentMode: 'cloud',
      aiProvider: 'openai-compatible',
      generateDraft,
    })

    expect(result).toEqual({ status: 'drafted', replyDraftId: 'draft-1' })
    expect(generateDraft).toHaveBeenCalledOnce()
    expect(transaction.lockUsagePeriod).toHaveBeenCalledOnce()
    expect(transaction.recordManagedDraftUsage).toHaveBeenCalledOnce()
    expect(transaction.recordManagedDraftUsage).toHaveBeenCalledWith('org-1')
  })
})

describe('generateReplyDraftForReview', () => {
  it('does not meter a failed Cloud generation', async () => {
    const transaction = createTransaction()
    const generateDraft = createDraftGenerator().mockRejectedValue(
      new AiDraftingError('provider_unavailable', 'Provider unavailable.'),
    )

    const result = await generateReplyDraftForReview({
      transaction,
      organizationId: 'org-1',
      reviewId: 'review-1',
      deploymentMode: 'cloud',
      aiProvider: 'openai-compatible',
      generateDraft,
    })

    expect(result).toEqual({ status: 'failed', errorCode: 'provider_unavailable' })
    expect(transaction.recordManagedDraftUsage).not.toHaveBeenCalled()
    expect(transaction.recordDraftFailure).toHaveBeenCalledWith(
      'org-1',
      'review-1',
      'provider_unavailable',
    )
  })
})

describe('generateReplyDraftForReview', () => {
  it('propagates persistence failures so the transaction can roll back', async () => {
    const transaction = createTransaction()
    const persistenceError = new Error('Reply Draft insert failed.')
    transaction.insertGeneratedDraft.mockRejectedValue(persistenceError)

    await expect(
      generateReplyDraftForReview({
        transaction,
        organizationId: 'org-1',
        reviewId: 'review-1',
        deploymentMode: 'cloud',
        aiProvider: 'openai-compatible',
        generateDraft: createDraftGenerator(),
      }),
    ).rejects.toThrow(persistenceError)
    expect(transaction.updateReviewWithDraft).toHaveBeenCalledOnce()
    expect(transaction.recordDraftFailure).not.toHaveBeenCalled()
  })
})

describe('generateReplyDraftForReview', () => {
  it('blocks Cloud generation at the monthly quota before calling the provider', async () => {
    const transaction = createTransaction(false)
    const generateDraft = vi.fn<DraftGenerator>()

    const result = await generateReplyDraftForReview({
      transaction,
      organizationId: 'org-1',
      reviewId: 'review-1',
      deploymentMode: 'cloud',
      aiProvider: 'managed',
      generateDraft,
    })

    expect(result).toEqual({
      status: 'skipped',
      reason: 'monthly_managed_ai_reply_draft_cap_reached',
    })
    expect(generateDraft).not.toHaveBeenCalled()
  })
})

describe('generateReplyDraftForReview', () => {
  it('keeps self-hosted generation outside billing usage', async () => {
    const transaction = createTransaction()
    const generateDraft = createDraftGenerator()

    const result = await generateReplyDraftForReview({
      transaction,
      organizationId: 'org-1',
      reviewId: 'review-1',
      deploymentMode: 'self-hosted',
      aiProvider: 'openai-compatible',
      generateDraft,
    })

    expect(result).toEqual({ status: 'drafted', replyDraftId: 'draft-1' })
    expect(transaction.lockUsagePeriod).not.toHaveBeenCalled()
    expect(transaction.recordManagedDraftUsage).not.toHaveBeenCalled()
  })
})

describe('concurrent Reply Draft generation', () => {
  it('does not replace or meter a draft created while the provider was running', async () => {
    const transaction = createTransaction()
    transaction.selectLatestDraftableReview.mockResolvedValue({
      ...reviewRow,
      replyDraft: { id: 'another-draft' },
    })
    const generateDraft = createDraftGenerator()

    const result = await generateReplyDraftForReview({
      transaction,
      organizationId: 'org-1',
      reviewId: 'review-1',
      deploymentMode: 'cloud',
      aiProvider: 'managed',
      generateDraft,
    })

    expect(result).toEqual({ status: 'skipped', reason: 'draft_exists' })
    expect(generateDraft).toHaveBeenCalledOnce()
    expect(transaction.updateReviewWithDraft).not.toHaveBeenCalled()
    expect(transaction.recordManagedDraftUsage).not.toHaveBeenCalled()
  })
})
