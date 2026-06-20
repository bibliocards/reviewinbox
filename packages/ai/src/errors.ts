export type AiDraftingErrorCode =
  | 'provider_unavailable'
  | 'provider_rate_limited'
  | 'invalid_provider_config'
  | 'safety_rejected'
  | 'context_too_large'
  | 'invalid_model_output'
  | 'unknown'

export class AiDraftingError extends Error {
  readonly code: AiDraftingErrorCode

  constructor(code: AiDraftingErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'AiDraftingError'
    this.code = code
  }
}
