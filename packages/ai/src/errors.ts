import { APICallError, NoObjectGeneratedError, NoOutputGeneratedError, RetryError } from 'ai'
import type { FinishReason } from 'ai'

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

/**
 * Converts provider SDK failures into the small set of errors understood by
 * the drafting workflow. The original provider error is intentionally not
 * included in the message: SDK errors can contain response bodies or request
 * details that must not end up in ReviewInbox logs or persisted state.
 */
export function translateVercelAiError(error: unknown, context: { finishReason?: FinishReason } = {}): AiDraftingError | null {
  const code = classifyVercelAiError(error, new Set(), context)

  if (!code) {
    return null
  }

  return new AiDraftingError(code, getAiDraftingErrorMessage(code))
}

function classifyVercelAiError(
  error: unknown,
  seen = new Set<unknown>(),
  context: { finishReason?: FinishReason } = {},
): AiDraftingErrorCode | null {
  if (error == null || seen.has(error)) {
    return null
  }

  seen.add(error)

  if (APICallError.isInstance(error)) {
    if (error.statusCode === 413 || hasContextLengthErrorCode(error.data)) {
      return 'context_too_large'
    }

    if (error.statusCode === 429) {
      return 'provider_rate_limited'
    }

    if (error.statusCode === 408 || error.statusCode === 409 || (error.statusCode !== undefined && error.statusCode >= 500)) {
      return 'provider_unavailable'
    }

    if (error.statusCode !== undefined && error.statusCode >= 400 && error.statusCode < 500) {
      return 'invalid_provider_config'
    }

    return error.isRetryable ? 'provider_unavailable' : null
  }

  if (RetryError.isInstance(error)) {
    for (const nestedError of [...error.errors].reverse()) {
      const nestedCode = classifyVercelAiError(nestedError, seen, context)
      if (nestedCode) {
        return nestedCode
      }
    }

    return error.reason === 'abort' || error.reason === 'maxRetriesExceeded' ? 'provider_unavailable' : null
  }

  if (NoObjectGeneratedError.isInstance(error)) {
    const causeCode = classifyVercelAiError(error.cause, seen, context)
    if (causeCode) {
      return causeCode
    }

    return error.finishReason === 'content-filter' ? 'safety_rejected' : 'invalid_model_output'
  }

  if (NoOutputGeneratedError.isInstance(error)) {
    const causeCode = classifyVercelAiError(error.cause, seen, context)
    if (causeCode) {
      return causeCode
    }

    return context.finishReason === 'content-filter' ? 'safety_rejected' : 'invalid_model_output'
  }

  if (isTimeoutError(error)) {
    return 'provider_unavailable'
  }

  if (isNetworkError(error)) {
    return 'provider_unavailable'
  }

  if (error instanceof Error && 'cause' in error) {
    return classifyVercelAiError(error.cause, seen, context)
  }

  return null
}

function hasContextLengthErrorCode(data: unknown): boolean {
  if (!isRecord(data) || !isRecord(data['error'])) {
    return false
  }

  return data['error']['code'] === 'context_length_exceeded'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
}

function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  const code = 'code' in error && typeof error.code === 'string' ? error.code : undefined
  if (code && ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE'].includes(code)) {
    return true
  }

  return error instanceof TypeError && ['fetch failed', 'failed to fetch'].includes(error.message.toLowerCase())
}

function getAiDraftingErrorMessage(code: AiDraftingErrorCode): string {
  switch (code) {
    case 'provider_rate_limited':
      return 'AI provider rate limit reached.'
    case 'provider_unavailable':
      return 'AI provider is temporarily unavailable.'
    case 'invalid_provider_config':
      return 'AI provider configuration was rejected.'
    case 'context_too_large':
      return 'Reply Draft context exceeds the AI provider limit.'
    case 'invalid_model_output':
      return 'AI provider returned invalid Reply Draft output.'
    default:
      return 'AI provider request failed.'
  }
}
