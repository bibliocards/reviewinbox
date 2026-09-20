import type { FlexibleSchema, LanguageModel } from 'ai'

import { translateVercelAiError } from './errors'
import type {
  ReplyDraftProvider,
  ReplyDraftProviderRequest,
  ReplyDraftProviderResult,
} from './provider'

export type VercelAiGenerateObject = (request: {
  model: LanguageModel
  system: string
  prompt: string
  schema: FlexibleSchema<unknown>
  temperature: number
  maxOutputTokens: number
}) => Promise<{ output: unknown }>

export type VercelAiReplyDraftAdapterOptions = {
  model: LanguageModel
  modelName: string
  generateText: VercelAiGenerateObject
}

export function createVercelAiReplyDraftProvider(
  options: VercelAiReplyDraftAdapterOptions,
): ReplyDraftProvider {
  return {
    async generateReplyDraftCompletion(
      request: ReplyDraftProviderRequest,
    ): Promise<ReplyDraftProviderResult> {
      let result: Awaited<ReturnType<VercelAiGenerateObject>>
      try {
        result = await options.generateText({
          model: options.model,
          system: request.system,
          prompt: request.prompt,
          schema: request.schema,
          temperature: request.temperature,
          maxOutputTokens: request.maxOutputTokens,
        })
      } catch (error) {
        throw (error instanceof Error ? translateVercelAiError(error) : null) ?? error
      }

      return { output: result.output, model: options.modelName }
    },
  }
}
