import type { ReplyDraftProvider, ReplyDraftProviderRequest, ReplyDraftProviderResult } from './provider'

export type VercelAiGenerateObject = (request: {
  model: unknown
  system: string
  prompt: string
  schema: unknown
  temperature: number
  maxOutputTokens: number
}) => Promise<{ object: unknown }>

export type VercelAiReplyDraftAdapterOptions = {
  model: unknown
  modelName: string
  generateObject: VercelAiGenerateObject
}

export function createVercelAiReplyDraftProvider(options: VercelAiReplyDraftAdapterOptions): ReplyDraftProvider {
  return {
    async generateReplyDraftCompletion(request: ReplyDraftProviderRequest): Promise<ReplyDraftProviderResult> {
      const result = await options.generateObject({
        model: options.model,
        system: request.system,
        prompt: request.prompt,
        schema: request.schema,
        temperature: request.temperature,
        maxOutputTokens: request.maxOutputTokens,
      })

      return {
        output: result.object,
        model: options.modelName,
      }
    },
  }
}
