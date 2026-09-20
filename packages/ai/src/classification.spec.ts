import { describe, expect, it, vi } from 'vitest'

import {
  createTypeSafeReviewClassifier,
  reviewIntentCodes,
  reviewSeverityCodes,
  type ReviewClassificationInput,
  type TypeSafeReviewClassifierClient,
} from './classification'

const input: ReviewClassificationInput = {
  title: 'Cannot sign in',
  body: 'I cannot sign in after the update. Please help.',
  rating: 1,
  language: 'en',
  topics: [
    {
      id: 'topic-account',
      label: 'Account access',
      description: 'Signing in, authentication, and account access.',
      validationStatus: 'approved',
    },
    {
      id: 'topic-sync',
      label: 'Synchronization',
      description: 'Keeping data synchronized across devices.',
      validationStatus: 'pending',
    },
    {
      id: 'topic-rejected',
      label: 'Old topic',
      description: 'A topic that must never be assigned.',
      validationStatus: 'rejected',
    },
  ],
}

function createChunkResponse(request: Parameters<TypeSafeReviewClassifierClient['systemOne']>[0]) {
  return {
    model: 'jev-1.0.0',
    usage: { input_tokens: 1, output_tokens: 1 },
    answers: Object.fromEntries(
      Object.keys(request.questions).map((key) => [
        key,
        key === 'severity'
          ? { type: 'score' as const, score: 2, confidence: 0.9, probabilities: { '2': 0.9 } }
          : { type: 'noul' as const, noul: key.endsWith('100') ? 0.8 : 0.1 },
      ]),
    ),
  }
}

describe('createTypeSafeReviewClassifier', () => {
  it('sends fixed intents, severity, active topics, and a catalogue-gap question', async () => {
    const systemOne = vi
      .fn<TypeSafeReviewClassifierClient['systemOne']>()
      .mockResolvedValue({
        model: 'jev-1.0.0',
        usage: { input_tokens: 20, output_tokens: 0 },
        answers: {
          ...Object.fromEntries(reviewIntentCodes.map((code) => [code, { type: 'noul', noul: 0 }])),
          severity: { type: 'score', score: 2, confidence: 0.9, probabilities: { '2': 0.9 } },
          topic_topic_account: { type: 'noul', noul: 0.92 },
          topic_topic_sync: { type: 'noul', noul: 0.12 },
          catalogue_gap: { type: 'noul', noul: 0.18 },
        },
      })
    const classifier = createTypeSafeReviewClassifier({ client: { systemOne } })

    const result = await classifier.classify(input)

    expect(systemOne).toHaveBeenCalledOnce()
    const request = systemOne.mock.calls[0]?.[0]
    expect(request?.state).toEqual({
      untrustedReview: {
        title: input.title,
        body: input.body,
        rating: input.rating,
        language: input.language,
      },
      activeTopics: [
        {
          id: 'topic-account',
          label: 'Account access',
          description: 'Signing in, authentication, and account access.',
        },
        {
          id: 'topic-sync',
          label: 'Synchronization',
          description: 'Keeping data synchronized across devices.',
        },
      ],
    })
    expect(request?.questions['severity']).toMatchObject({ type: 'score' })
    expect(request?.questions['catalogue_gap']).toMatchObject({ type: 'noul' })
    expect(request?.questions['topic_topic_account']).toMatchObject({ type: 'noul' })
    expect(request?.questions['topic_topic_sync']).toMatchObject({ type: 'noul' })
    expect(request?.questions).not.toHaveProperty('topic_topic_rejected')
    expect(result.model).toBe('jev-1.0.0')
    expect(result.topicMatches).toEqual([
      { topicId: 'topic-account', probability: 0.92 },
      { topicId: 'topic-sync', probability: 0.12 },
    ])
    expect(result.severity.code).toBe('degraded')
    expect(result.catalogueGapProbability).toBe(0.18)
  })

  it('returns no active topic questions when the catalogue is empty', async () => {
    const systemOne = vi
      .fn<TypeSafeReviewClassifierClient['systemOne']>()
      .mockResolvedValue({
        model: 'jev-1.0.0',
        usage: { input_tokens: 1, output_tokens: 0 },
        answers: {
          ...Object.fromEntries(reviewIntentCodes.map((code) => [code, { type: 'noul', noul: 0 }])),
          severity: { type: 'score', score: 0, confidence: 0.5, probabilities: { '0': 0.9 } },
          catalogue_gap: { type: 'noul', noul: 1 },
        },
      })
    const classifier = createTypeSafeReviewClassifier({ client: { systemOne } })

    const result = await classifier.classify({ ...input, topics: [] })

    const request = systemOne.mock.calls[0]?.[0]
    expect(request?.questions).toHaveProperty('severity')
    expect(request?.questions).toHaveProperty('catalogue_gap')
    expect(request?.questions).not.toHaveProperty('topic_topic_account')
    expect(result.topicMatches).toEqual([])
    expect(result.catalogueGapProbability).toBe(1)
  })
})

describe('topic catalogue chunks', () => {
  it('classifies every active topic across bounded catalogue chunks', async () => {
    const systemOne = vi
      .fn<TypeSafeReviewClassifierClient['systemOne']>()
      .mockImplementation((request) => Promise.resolve(createChunkResponse(request)))
    const classifier = createTypeSafeReviewClassifier({ client: { systemOne } })
    const topics = Array.from({ length: 101 }, (_, index) => ({
      id: `topic-${index}`,
      label: `Topic ${index}`,
      description: 'A bounded topic description.',
      validationStatus: 'approved' as const,
    }))

    const result = await classifier.classify({ ...input, topics })

    expect(systemOne).toHaveBeenCalledTimes(2)
    expect(result.topicMatches).toHaveLength(101)
    expect(result.topicMatches).toContainEqual({ topicId: 'topic-100', probability: 0.8 })
    expect(result.usage).toEqual({ inputTokens: 2, outputTokens: 2 })
  })
})

describe('classification codes', () => {
  it('keeps stable, language-independent fixed values', () => {
    expect(reviewIntentCodes).toEqual([
      'report_problem',
      'request_feature',
      'request_help',
      'request_refund',
      'express_satisfaction',
      'express_dissatisfaction',
    ])
    expect(reviewSeverityCodes).toEqual(['none', 'minor', 'degraded', 'blocking', 'critical'])
  })
})
