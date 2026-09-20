import { describe, expect, it, vi } from 'vitest'

const { generateTextMock, outputObjectMock } = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
  outputObjectMock: vi.fn((input: unknown) => input),
}))

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>()
  return {
    ...actual,
    Output: { object: outputObjectMock },
    generateText: generateTextMock,
  }
})

import { APICallError, NoObjectGeneratedError, RetryError } from 'ai'
import { createOpenAiCompatibleReplyDraftProvider, replyDraftProviderTimeoutMs } from './vercel-ai-provider-factory'

function createApiCallError(statusCode?: number, data?: unknown): APICallError {
  return new APICallError({
    message: 'Provider request failed.',
    url: 'https://provider.example.test/v1/chat/completions',
    requestBodyValues: {},
    ...(statusCode === undefined ? { isRetryable: true } : { statusCode }),
    ...(data === undefined ? {} : { data }),
  })
}

describe('createOpenAiCompatibleReplyDraftProvider', () => {
  it('bounds provider calls and disables implicit retries while the worker holds its quota transaction', async () => {
    generateTextMock.mockResolvedValueOnce({ output: { draftText: 'Thanks for your review.' } })
    const provider = createOpenAiCompatibleReplyDraftProvider({ apiKey: 'test-key', model: 'test-model' })

    await provider.generateReplyDraftCompletion({
      system: 'system',
      prompt: 'prompt',
      schema: {},
      temperature: 0.3,
      maxOutputTokens: 100,
    })

    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        maxRetries: 0,
        timeout: replyDraftProviderTimeoutMs,
      }),
    )
  })

  it('translates a rate-limited SDK error into a retryable domain error', async () => {
    generateTextMock.mockRejectedValueOnce(createApiCallError(429))
    const provider = createOpenAiCompatibleReplyDraftProvider({ apiKey: 'test-key', model: 'test-model' })

    await expect(
      provider.generateReplyDraftCompletion({
        system: 'system',
        prompt: 'prompt',
        schema: {},
        temperature: 0.3,
        maxOutputTokens: 100,
      }),
    ).rejects.toMatchObject({ name: 'AiDraftingError', code: 'provider_rate_limited' })
  })

  it('classifies provider context limits separately from provider configuration errors', async () => {
    for (const error of [createApiCallError(413), createApiCallError(400, { error: { code: 'context_length_exceeded' } })]) {
      generateTextMock.mockRejectedValueOnce(error)
      const provider = createOpenAiCompatibleReplyDraftProvider({ apiKey: 'test-key', model: 'test-model' })

      await expect(
        provider.generateReplyDraftCompletion({
          system: 'system',
          prompt: 'prompt',
          schema: {},
          temperature: 0.3,
          maxOutputTokens: 100,
        }),
      ).rejects.toMatchObject({ name: 'AiDraftingError', code: 'context_too_large' })
    }
  })

  it('translates transient SDK failures and timeout errors into provider unavailable', async () => {
    for (const error of [createApiCallError(503), createApiCallError(), new DOMException('Timed out.', 'TimeoutError')]) {
      generateTextMock.mockRejectedValueOnce(error)
      const provider = createOpenAiCompatibleReplyDraftProvider({ apiKey: 'test-key', model: 'test-model' })

      await expect(
        provider.generateReplyDraftCompletion({
          system: 'system',
          prompt: 'prompt',
          schema: {},
          temperature: 0.3,
          maxOutputTokens: 100,
        }),
      ).rejects.toMatchObject({ name: 'AiDraftingError', code: 'provider_unavailable' })
    }
  })

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
    const provider = createOpenAiCompatibleReplyDraftProvider({ apiKey: 'test-key', model: 'test-model' })

    await expect(
      provider.generateReplyDraftCompletion({
        system: 'system',
        prompt: 'prompt',
        schema: {},
        temperature: 0.3,
        maxOutputTokens: 100,
      }),
    ).rejects.toMatchObject({ name: 'AiDraftingError', code: 'safety_rejected' })
  })

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
    const provider = createOpenAiCompatibleReplyDraftProvider({ apiKey: 'test-key', model: 'test-model' })

    await expect(
      provider.generateReplyDraftCompletion({
        system: 'system',
        prompt: 'prompt',
        schema: {},
        temperature: 0.3,
        maxOutputTokens: 100,
      }),
    ).rejects.toMatchObject({ name: 'AiDraftingError', code: 'provider_unavailable' })
  })

  it('keeps permanent provider configuration and invalid output failures distinct', async () => {
    generateTextMock.mockRejectedValueOnce(createApiCallError(401))
    const provider = createOpenAiCompatibleReplyDraftProvider({ apiKey: 'test-key', model: 'test-model' })

    await expect(
      provider.generateReplyDraftCompletion({
        system: 'system',
        prompt: 'prompt',
        schema: {},
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
        schema: {},
        temperature: 0.3,
        maxOutputTokens: 100,
      }),
    ).rejects.toMatchObject({ name: 'AiDraftingError', code: 'invalid_model_output' })
  })
})
