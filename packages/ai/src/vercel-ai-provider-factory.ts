import type { OpenAIProviderSettings } from '@ai-sdk/openai'
import { createOpenAI } from '@ai-sdk/openai'
import type { FlexibleSchema } from 'ai'
import { generateText, Output } from 'ai'

import { createVercelAiReplyDraftProvider } from './vercel-ai-adapter'

export type OpenAiCompatibleReplyDraftProviderOptions = {
  apiKey: string
  model: string
  baseUrl?: string
  providerName?: string
}

export function createOpenAiCompatibleReplyDraftProvider(options: OpenAiCompatibleReplyDraftProviderOptions) {
  const providerSettings: OpenAIProviderSettings = {
    apiKey: options.apiKey,
    name: options.providerName ?? 'openai-compatible',
  }

  if (options.baseUrl) {
    providerSettings.baseURL = options.baseUrl
  }

  const provider = createOpenAI(providerSettings)

  return createVercelAiReplyDraftProvider({
    model: provider(options.model),
    modelName: options.model,
    async generateText(request) {
      const result = await generateText({
        model: request.model,
        system: request.system,
        prompt: request.prompt,
        output: Output.object({ schema: request.schema as FlexibleSchema<unknown> }),
        temperature: request.temperature,
        maxOutputTokens: request.maxOutputTokens,
      })

      return { output: result.output }
    },
  })
}
