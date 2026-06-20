export type ReplyDraftProviderRequest = {
  system: string
  prompt: string
  schema: unknown
  temperature: number
  maxOutputTokens: number
}

export type ReplyDraftProviderResult = {
  output: unknown
  model: string
}

export type ReplyDraftProvider = {
  generateReplyDraftCompletion(request: ReplyDraftProviderRequest): Promise<ReplyDraftProviderResult>
}
