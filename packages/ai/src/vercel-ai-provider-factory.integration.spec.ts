import { MockLanguageModelV3 } from 'ai/test'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

const { createOpenAiMock } = vi.hoisted(() => ({
  createOpenAiMock: vi.fn(),
}))

vi.mock('@ai-sdk/openai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ai-sdk/openai')>()
  return { ...actual, createOpenAI: createOpenAiMock }
})

import { createOpenAiCompatibleReplyDraftProvider } from './vercel-ai-provider-factory'

const outputSchema = z.object({ draftText: z.string() })

type TestModelResult = {
  content: Array<{ type: 'text'; text: string }>
  finishReason: { unified: 'stop' | 'content-filter'; raw: string }
  usage: {
    inputTokens: { total: number; noCache: number; cacheRead: number; cacheWrite: number }
    outputTokens: { total: number; text: number; reasoning: number }
  }
  response: { id: string; timestamp: Date; modelId: string }
  warnings: []
}

function createModelResult(input: { finishReason: TestModelResult['finishReason']; text?: string }): TestModelResult {
  return {
    content: input.text === undefined ? [] : [{ type: 'text', text: input.text }],
    finishReason: input.finishReason,
    usage: {
      inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 0, text: 0, reasoning: 0 },
    },
    response: { id: 'test-response', timestamp: new Date(0), modelId: 'test-model' },
    warnings: [],
  }
}

function createProvider(result: TestModelResult) {
  const model = new MockLanguageModelV3({ doGenerate: result })
  createOpenAiMock.mockReturnValue(() => model)

  return createOpenAiCompatibleReplyDraftProvider({ apiKey: 'test-key', model: 'test-model' })
}

describe('createOpenAiCompatibleReplyDraftProvider with the installed AI SDK', () => {
  beforeEach(() => {
    createOpenAiMock.mockReset()
  })

  it('classifies content filtering from the real structured-output path as safety rejected', async () => {
    const provider = createProvider({
      ...createModelResult({ finishReason: { unified: 'content-filter', raw: 'content_filter' } }),
    })

    await expect(
      provider.generateReplyDraftCompletion({
        system: 'system',
        prompt: 'prompt',
        schema: outputSchema,
        temperature: 0.3,
        maxOutputTokens: 100,
      }),
    ).rejects.toMatchObject({ name: 'AiDraftingError', code: 'safety_rejected' })
  })

  it('classifies malformed structured output from the real path as invalid model output', async () => {
    const provider = createProvider({
      ...createModelResult({ finishReason: { unified: 'stop', raw: 'stop' }, text: 'not-json' }),
    })

    await expect(
      provider.generateReplyDraftCompletion({
        system: 'system',
        prompt: 'prompt',
        schema: outputSchema,
        temperature: 0.3,
        maxOutputTokens: 100,
      }),
    ).rejects.toMatchObject({ name: 'AiDraftingError', code: 'invalid_model_output' })
  })
})
