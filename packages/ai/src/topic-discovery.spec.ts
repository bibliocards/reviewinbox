import { describe, expect, it, vi } from 'vitest'

import {
  createOpenAiCompatibleTopicDiscoveryProvider,
  type OpenAiCompatibleTopicDiscoveryProviderDependencies,
} from './topic-discovery'

describe('createOpenAiCompatibleTopicDiscoveryProvider', () => {
  it('proposes bounded English topics from uncovered reviews', async () => {
    const generateText = vi
      .fn<OpenAiCompatibleTopicDiscoveryProviderDependencies['generateText']>()
      .mockResolvedValue({
        output: { topics: [{ label: 'Login', description: 'Signing in and account access.' }] },
      })
    const createOpenAI = vi
      .fn<OpenAiCompatibleTopicDiscoveryProviderDependencies['createOpenAI']>()
      .mockReturnValue(vi.fn())
    const provider = createOpenAiCompatibleTopicDiscoveryProvider(
      { apiKey: 'key', model: 'luna' },
      { createOpenAI, generateText },
    )

    await expect(
      provider.proposeTopics({
        reviews: [{ title: null, body: 'Cannot login', rating: 1 }],
        existingTopics: [{ label: 'Payments', description: 'Billing', aliases: [] }],
      }),
    ).resolves.toEqual([{ label: 'Login', description: 'Signing in and account access.' }])
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 0, maxRetries: 0 }),
    )
  })
})
