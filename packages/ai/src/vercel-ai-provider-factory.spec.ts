import { APICallError, NoObjectGeneratedError, RetryError } from 'ai'
import { MockLanguageModelV3 } from 'ai/test'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { replyDraftOutputSchema } from './output-schema'
import type {
  OpenAiCompatibleReplyDraftProviderDependencies,
  OpenAiCompatibleReplyDraftProviderOptions,
} from './vercel-ai-provider-factory'
import {
  createOpenAiCompatibleReplyDraftProvider,
  replyDraftProviderTimeoutMs,
} from './vercel-ai-provider-factory'

type ProviderErrorData = { error?: { code?: string } }

const createOpenAiMock = vi.fn<OpenAiCompatibleReplyDraftProviderDependencies['createOpenAI']>()
const generateTextMock = vi.fn<OpenAiCompatibleReplyDraftProviderDependencies['generateText']>()
const dependencies: OpenAiCompatibleReplyDraftProviderDependencies = {
  createOpenAI: createOpenAiMock,
  generateText: generateTextMock,
}

beforeEach(() => {
  createOpenAiMock.mockReset()
  generateTextMock.mockReset()
})
const providerOptions: OpenAiCompatibleReplyDraftProviderOptions = {
  apiKey: 'test-key',
  model: 'test-model',
}

function createApiCallError(statusCode?: number, data?: ProviderErrorData): APICallError {
  const base = {
    message: 'Provider request failed.',
    url: 'https://provider.example.test/v1/chat/completions',
    requestBodyValues: {},
  }

  if (statusCode === undefined) {
    return new APICallError({ ...base, isRetryable: true })
  }

  return data === undefined
    ? new APICallError({ ...base, statusCode })
    : new APICallError({ ...base, statusCode, data })
}

function createProvider() {
  createOpenAiMock.mockReturnValue(() => new MockLanguageModelV3())
  return createOpenAiCompatibleReplyDraftProvider(providerOptions, dependencies)
}

async function expectProviderError(error: Error, code: string): Promise<void> {
  generateTextMock.mockRejectedValueOnce(error)
  await expect(
    createProvider().generateReplyDraftCompletion({
      system: 'system',
      prompt: 'prompt',
      schema: replyDraftOutputSchema,
      temperature: 0.3,
      maxOutputTokens: 100,
    }),
  ).rejects.toMatchObject({ name: 'AiDraftingError', code })
}

describe('createOpenAiCompatibleReplyDraftProvider', () => {
  it('bounds provider calls and disables implicit retries while the worker holds its quota transaction', async () => {
    generateTextMock.mockResolvedValueOnce({
      output: { draftText: 'Thanks for your review.' },
      finishReason: 'stop',
    })
    const provider = createProvider()

    await provider.generateReplyDraftCompletion({
      system: 'system',
      prompt: 'prompt',
      schema: replyDraftOutputSchema,
      temperature: 0.3,
      maxOutputTokens: 100,
    })

    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: 'system',
        maxRetries: 0,
        timeout: replyDraftProviderTimeoutMs,
      }),
    )
  })
})

describe('createOpenAiCompatibleReplyDraftProvider', () => {
  it('translates a rate-limited SDK error into a retryable domain error', async () => {
    await expectProviderError(createApiCallError(429), 'provider_rate_limited')
    expect(generateTextMock).toHaveBeenCalledOnce()
  })
})

describe('createOpenAiCompatibleReplyDraftProvider', () => {
  it('classifies provider context limits separately from provider configuration errors', async () => {
    await expectProviderError(createApiCallError(413), 'context_too_large')
    await expectProviderError(
      createApiCallError(400, { error: { code: 'context_length_exceeded' } }),
      'context_too_large',
    )
    expect(generateTextMock).toHaveBeenCalledTimes(2)
  })
})

describe('createOpenAiCompatibleReplyDraftProvider', () => {
  it('translates transient SDK failures and timeout errors into provider unavailable', async () => {
    await expectProviderError(createApiCallError(503), 'provider_unavailable')
    await expectProviderError(createApiCallError(), 'provider_unavailable')
    await expectProviderError(
      new DOMException('Timed out.', 'TimeoutError'),
      'provider_unavailable',
    )
    expect(generateTextMock).toHaveBeenCalledTimes(3)
  })
})

describe('createOpenAiCompatibleReplyDraftProvider', () => {
  it('classifies a provider content filter as a safety rejection', async () => {
    generateTextMock.mockRejectedValueOnce(
      new NoObjectGeneratedError({
        response: { id: 'test-response', timestamp: new Date(0), modelId: 'test-model' },
        usage: {
          inputTokens: 0,
          inputTokenDetails: { noCacheTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
          outputTokens: 0,
          outputTokenDetails: { textTokens: 0, reasoningTokens: 0 },
          totalTokens: 0,
        },
        finishReason: 'content-filter',
      }),
    )
    const provider = createProvider()

    await expect(
      provider.generateReplyDraftCompletion({
        system: 'system',
        prompt: 'prompt',
        schema: replyDraftOutputSchema,
        temperature: 0.3,
        maxOutputTokens: 100,
      }),
    ).rejects.toMatchObject({ name: 'AiDraftingError', code: 'safety_rejected' })
  })
})

describe('createOpenAiCompatibleReplyDraftProvider', () => {
  it('preserves a transient provider cause nested in an invalid output error', async () => {
    generateTextMock.mockRejectedValueOnce(
      new NoObjectGeneratedError({
        response: { id: 'test-response', timestamp: new Date(0), modelId: 'test-model' },
        usage: {
          inputTokens: 0,
          inputTokenDetails: { noCacheTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
          outputTokens: 0,
          outputTokenDetails: { textTokens: 0, reasoningTokens: 0 },
          totalTokens: 0,
        },
        finishReason: 'stop',
        cause: createApiCallError(503),
      }),
    )
    const provider = createProvider()

    await expect(
      provider.generateReplyDraftCompletion({
        system: 'system',
        prompt: 'prompt',
        schema: replyDraftOutputSchema,
        temperature: 0.3,
        maxOutputTokens: 100,
      }),
    ).rejects.toMatchObject({ name: 'AiDraftingError', code: 'provider_unavailable' })
  })
})

describe('createOpenAiCompatibleReplyDraftProvider', () => {
  it('keeps permanent provider configuration and invalid output failures distinct', async () => {
    generateTextMock.mockRejectedValueOnce(createApiCallError(401))
    const provider = createProvider()

    await expect(
      provider.generateReplyDraftCompletion({
        system: 'system',
        prompt: 'prompt',
        schema: replyDraftOutputSchema,
        temperature: 0.3,
        maxOutputTokens: 100,
      }),
    ).rejects.toMatchObject({ name: 'AiDraftingError', code: 'invalid_provider_config' })

    generateTextMock.mockRejectedValueOnce(
      new RetryError({
        message: 'No object generated.',
        reason: 'errorNotRetryable',
        errors: [
          new NoObjectGeneratedError({
            response: { id: 'test-response', timestamp: new Date(0), modelId: 'test-model' },
            usage: {
              inputTokens: 0,
              inputTokenDetails: { noCacheTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
              outputTokens: 0,
              outputTokenDetails: { textTokens: 0, reasoningTokens: 0 },
              totalTokens: 0,
            },
            finishReason: 'stop',
          }),
        ],
      }),
    )
    await expect(
      provider.generateReplyDraftCompletion({
        system: 'system',
        prompt: 'prompt',
        schema: replyDraftOutputSchema,
        temperature: 0.3,
        maxOutputTokens: 100,
      }),
    ).rejects.toMatchObject({ name: 'AiDraftingError', code: 'invalid_model_output' })
  })
})
