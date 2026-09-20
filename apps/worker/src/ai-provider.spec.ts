import { describe, expect, it } from 'vitest'

import { loadAiConfig } from '@reviewinbox/config'

import { createWorkerReplyDraftProvider } from './ai-provider'

describe('createWorkerReplyDraftProvider', () => {
  it('keeps drafting disabled when the provider is disabled', () => {
    expect(createWorkerReplyDraftProvider(loadAiConfig({}))).toBeNull()
  })

  it('creates a provider for managed cloud AI using the configured compatible transport', () => {
    const config = loadAiConfig({
      DEPLOYMENT_MODE: 'cloud',
      AI_PROVIDER: 'managed',
      AI_MODEL: 'gpt-4.1-mini',
      AI_API_KEY: 'operator-key',
      AI_BASE_URL: 'https://ai.example.com/v1',
    })

    expect(createWorkerReplyDraftProvider(config)).not.toBeNull()
  })

  it('creates a provider for self-hosted OpenAI-compatible AI', () => {
    const config = loadAiConfig({
      AI_PROVIDER: 'openai-compatible',
      AI_MODEL: 'llama3.2',
      AI_API_KEY: 'local-key',
      AI_BASE_URL: 'http://localhost:11434/v1',
    })

    expect(createWorkerReplyDraftProvider(config)).not.toBeNull()
  })
})
