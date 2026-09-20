import type { FlexibleSchema } from 'ai'

export type ReplyDraftProviderRequest = {
  system: string
  prompt: string
  schema: FlexibleSchema<unknown>
  temperature: number
  maxOutputTokens: number
}

export type ReplyDraftProviderResult = { output: unknown; model: string }

export type ReplyDraftProvider = {
  generateReplyDraftCompletion(
    request: ReplyDraftProviderRequest,
  ): Promise<ReplyDraftProviderResult>
}
