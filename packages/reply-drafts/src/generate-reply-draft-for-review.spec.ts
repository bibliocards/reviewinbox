import { describe, expect, it, vi } from 'vitest'

import { AiDraftingError } from '@reviewinbox/ai'
import type { Database } from '@reviewinbox/db'

import { generateReplyDraftForReview } from './generate-reply-draft-for-review'

const reviewRow = {
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

type QueryBuilder = {
  from: (value: unknown) => QueryBuilder
  innerJoin: (value: unknown, on: unknown) => QueryBuilder
  leftJoin: (value: unknown, on: unknown) => QueryBuilder
  where: (value: unknown) => QueryBuilder
  limit: (value: number) => Promise<unknown>
}

function createQuery(result: unknown): QueryBuilder {
  const query = {} as QueryBuilder
  query.from = vi.fn(() => query)
  query.innerJoin = vi.fn(() => query)
  query.leftJoin = vi.fn(() => query)
  query.where = vi.fn(() => query)
  query.limit = vi.fn().mockResolvedValue(result)
  Object.defineProperty(query, 'then', {
    value: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
  })
  return query
}

function createDatabase(input: { usageQuantity?: number; usageEventInsert?: ReturnType<typeof vi.fn> } = {}) {
  const initialQuery = createQuery([reviewRow])
  const usageQuery = createQuery([{ quantity: input.usageQuantity ?? 0 }])
  const latestQuery = createQuery([reviewRow])
  const updateChain = {
    set: vi.fn(() => updateChain),
    where: vi.fn(() => updateChain),
    returning: vi.fn().mockResolvedValue([{ id: 'review-1', organizationId: 'org-1', appId: 'app-1' }]),
  }
  const replyDraftInsert = {
    values: vi.fn(() => replyDraftInsert),
    onConflictDoNothing: vi.fn(() => replyDraftInsert),
    returning: vi.fn().mockResolvedValue([{ id: 'draft-1' }]),
  }
  const usageEventInsert = input.usageEventInsert ?? vi.fn().mockResolvedValue(undefined)
  const transaction = {
    select:
      input.usageQuantity === undefined
        ? vi.fn().mockReturnValueOnce(initialQuery).mockReturnValueOnce(latestQuery)
        : vi.fn().mockReturnValueOnce(initialQuery).mockReturnValueOnce(usageQuery).mockReturnValueOnce(latestQuery),
    execute: vi.fn().mockResolvedValue(undefined),
    query: {
      organization: {
        findFirst: vi.fn().mockResolvedValue({ planName: 'free', billingOverrides: {} }),
      },
    },
    update: vi.fn().mockReturnValue(updateChain),
    insert: vi.fn().mockReturnValueOnce(replyDraftInsert).mockReturnValueOnce({ values: usageEventInsert }),
  }
  const database = {
    transaction: vi.fn(async (callback: (value: typeof transaction) => Promise<unknown>) => callback(transaction)),
  }

  return { database: database as unknown as Database, transaction, updateChain, usageEventInsert }
}

describe('generateReplyDraftForReview', () => {
  it('meters a successful Cloud OpenAI-compatible generation', async () => {
    const { database, transaction, usageEventInsert } = createDatabase({ usageQuantity: 0 })
    const generateDraft = vi.fn().mockResolvedValue(generatedDraft)

    const result = await generateReplyDraftForReview({
      database,
      organizationId: 'org-1',
      reviewId: 'review-1',
      deploymentMode: 'cloud',
      aiProvider: 'openai-compatible',
      generateDraft,
    })

    expect(result).toEqual({ status: 'drafted', replyDraftId: 'draft-1' })
    expect(generateDraft).toHaveBeenCalledOnce()
    expect(transaction.execute).toHaveBeenCalledOnce()
    expect(transaction.insert).toHaveBeenCalledTimes(2)
    expect(usageEventInsert).toHaveBeenCalledWith({
      organizationId: 'org-1',
      type: 'managed_ai_reply_draft_generated',
      quantity: 1,
      occurredAt: expect.any(Date),
    })
  })

  it('does not meter a failed Cloud generation', async () => {
    const usageEventInsert = vi.fn().mockResolvedValue(undefined)
    const { database, transaction, usageEventInsert: recordedUsageEventInsert } = createDatabase({ usageEventInsert, usageQuantity: 0 })
    const generateDraft = vi.fn().mockRejectedValue(new AiDraftingError('provider_unavailable', 'Provider unavailable.'))
    const failureUpdate = {
      set: vi.fn(() => failureUpdate),
      where: vi.fn().mockResolvedValue(undefined),
    }
    transaction.update.mockReturnValue(failureUpdate)

    const result = await generateReplyDraftForReview({
      database,
      organizationId: 'org-1',
      reviewId: 'review-1',
      deploymentMode: 'cloud',
      aiProvider: 'openai-compatible',
      generateDraft,
    })

    expect(result).toEqual({ status: 'failed', errorCode: 'provider_unavailable' })
    expect(recordedUsageEventInsert).not.toHaveBeenCalled()
    expect(failureUpdate.set).toHaveBeenCalledWith(expect.objectContaining({ replyStatus: 'failed' }))
  })

  it('propagates persistence failures so the transaction can roll back', async () => {
    const { database, transaction, updateChain } = createDatabase({ usageQuantity: 0 })
    const persistenceError = new Error('Reply Draft insert failed.')
    const failingReplyDraftInsert = {
      values: vi.fn(() => failingReplyDraftInsert),
      onConflictDoNothing: vi.fn(() => failingReplyDraftInsert),
      returning: vi.fn().mockRejectedValue(persistenceError),
    }
    transaction.insert.mockReset()
    transaction.insert.mockReturnValue(failingReplyDraftInsert)

    await expect(
      generateReplyDraftForReview({
        database,
        organizationId: 'org-1',
        reviewId: 'review-1',
        deploymentMode: 'cloud',
        aiProvider: 'openai-compatible',
        generateDraft: vi.fn().mockResolvedValue(generatedDraft),
      }),
    ).rejects.toThrow(persistenceError)
    expect(updateChain.set).toHaveBeenCalledWith(expect.objectContaining({ replyStatus: 'drafted' }))
    expect(updateChain.set).not.toHaveBeenCalledWith(expect.objectContaining({ replyStatus: 'failed' }))
  })

  it('blocks Cloud generation at the monthly quota before calling the provider', async () => {
    const { database } = createDatabase({ usageQuantity: 5 })
    const generateDraft = vi.fn()

    const result = await generateReplyDraftForReview({
      database,
      organizationId: 'org-1',
      reviewId: 'review-1',
      deploymentMode: 'cloud',
      aiProvider: 'managed',
      generateDraft,
    })

    expect(result).toEqual({ status: 'skipped', reason: 'monthly_managed_ai_reply_draft_cap_reached' })
    expect(generateDraft).not.toHaveBeenCalled()
  })

  it('keeps self-hosted generation outside billing usage', async () => {
    const { database, transaction, usageEventInsert } = createDatabase()
    const generateDraft = vi.fn().mockResolvedValue(generatedDraft)

    const result = await generateReplyDraftForReview({
      database,
      organizationId: 'org-1',
      reviewId: 'review-1',
      deploymentMode: 'self-hosted',
      aiProvider: 'openai-compatible',
      generateDraft,
    })

    expect(result).toEqual({ status: 'drafted', replyDraftId: 'draft-1' })
    expect(transaction.execute).not.toHaveBeenCalled()
    expect(transaction.insert).toHaveBeenCalledOnce()
    expect(usageEventInsert).not.toHaveBeenCalled()
  })
})
