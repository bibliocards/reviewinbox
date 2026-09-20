import type { OpenAIProviderSettings } from '@ai-sdk/openai'
import { createOpenAI } from '@ai-sdk/openai'
import { generateText, Output } from 'ai'
import type { LanguageModel } from 'ai'
import type { FinishReason } from 'ai'

import { translateVercelAiError } from './errors'
import { createVercelAiReplyDraftProvider } from './vercel-ai-adapter'

export type OpenAiCompatibleReplyDraftProviderOptions = {
  apiKey: string
  model: string
  baseUrl?: string
  providerName?: string
}

type OpenAiModelProvider = (modelId: string) => LanguageModel
type CreateOpenAiDependency = (settings: OpenAIProviderSettings) => OpenAiModelProvider
type GenerateTextRequest = Parameters<typeof generateText>[0]
type GenerateTextResult = { output: unknown; finishReason: FinishReason }
type GenerateTextDependency = (request: GenerateTextRequest) => Promise<GenerateTextResult>

export type OpenAiCompatibleReplyDraftProviderDependencies = {
  createOpenAI: CreateOpenAiDependency
  generateText: GenerateTextDependency
}

const defaultDependencies: OpenAiCompatibleReplyDraftProviderDependencies = {
  createOpenAI,
  generateText,
}

export const replyDraftProviderTimeoutMs = 60_000

export function createOpenAiCompatibleReplyDraftProvider(
  options: OpenAiCompatibleReplyDraftProviderOptions,
  dependencies: OpenAiCompatibleReplyDraftProviderDependencies = defaultDependencies,
) {
  const providerSettings: OpenAIProviderSettings = {
    apiKey: options.apiKey,
    name: options.providerName ?? 'openai-compatible',
  }

  if (options.baseUrl !== undefined && options.baseUrl !== '') {
    providerSettings.baseURL = options.baseUrl
  }

  const provider = dependencies.createOpenAI(providerSettings)

  return createVercelAiReplyDraftProvider({
    model: provider(options.model),
    modelName: options.model,
    async generateText(request) {
      const result = await dependencies.generateText({
        model: request.model,
        instructions: request.system,
        prompt: request.prompt,
        output: Output.object({ schema: request.schema }),
        temperature: request.temperature,
        maxOutputTokens: request.maxOutputTokens,
        maxRetries: 0,
        timeout: replyDraftProviderTimeoutMs,
      })

      try {
        return { output: result.output }
      } catch (error) {
        throw (
          (error instanceof Error
            ? translateVercelAiError(error, { finishReason: result.finishReason })
            : null) ?? error
        )
      }
    },
  })
}
