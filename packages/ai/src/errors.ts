import { APICallError, NoObjectGeneratedError, NoOutputGeneratedError, RetryError } from 'ai'
import type { FinishReason } from 'ai'
import { z } from 'zod'

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

type ErrorContext = { finishReason?: FinishReason }
type SeenErrors = Set<Error>

const providerErrorDataSchema = z.object({ error: z.object({ code: z.string() }).optional() })
const networkErrorCodeSchema = z.enum(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE'])
type ProviderErrorData = z.infer<typeof providerErrorDataSchema>

const aiDraftingErrorMessages: Record<AiDraftingErrorCode, string> = {
  provider_rate_limited: 'AI provider rate limit reached.',
  provider_unavailable: 'AI provider is temporarily unavailable.',
  invalid_provider_config: 'AI provider configuration was rejected.',
  safety_rejected: 'AI provider request failed.',
  context_too_large: 'Reply Draft context exceeds the AI provider limit.',
  invalid_model_output: 'AI provider returned invalid Reply Draft output.',
  unknown: 'AI provider request failed.',
}

/**
 * Converts provider SDK failures into the small set of errors understood by
 * the drafting workflow. The original provider error is intentionally not
 * included in the message: SDK errors can contain response bodies or request
 * details that must not end up in ReviewInbox logs or persisted state.
 */
export function translateVercelAiError(
  error: Error,
  context: ErrorContext = {},
): AiDraftingError | null {
  const code = classifyVercelAiError(error, new Set(), context)

  if (!code) {
    return null
  }

  return new AiDraftingError(code, getAiDraftingErrorMessage(code))
}

function classifyVercelAiError(
  error: Error,
  seen: SeenErrors,
  context: ErrorContext,
): AiDraftingErrorCode | null {
  if (seen.has(error)) {
    return null
  }

  seen.add(error)

  return (
    classifyKnownProviderError(error, seen, context) ?? classifyGenericError(error, seen, context)
  )
}

function classifyKnownProviderError(
  error: Error,
  seen: SeenErrors,
  context: ErrorContext,
): AiDraftingErrorCode | null {
  if (APICallError.isInstance(error)) {
    return classifyApiCallError(error)
  }

  if (RetryError.isInstance(error)) {
    return classifyRetryError(error, seen, context)
  }

  if (NoObjectGeneratedError.isInstance(error)) {
    return classifyNoObjectGeneratedError(error, seen, context)
  }

  if (NoOutputGeneratedError.isInstance(error)) {
    return classifyNoOutputGeneratedError(error, seen, context)
  }

  return null
}

function classifyApiCallError(error: APICallError): AiDraftingErrorCode | null {
  if (error.statusCode === 413 || isContextLengthErrorData(error.data)) {
    return 'context_too_large'
  }

  if (error.statusCode === 429) {
    return 'provider_rate_limited'
  }

  if (isTransientStatus(error.statusCode)) {
    return 'provider_unavailable'
  }

  if (isClientErrorStatus(error.statusCode)) {
    return 'invalid_provider_config'
  }

  return error.isRetryable ? 'provider_unavailable' : null
}

function isTransientStatus(statusCode: number | undefined): boolean {
  return statusCode === 408 || statusCode === 409 || (statusCode !== undefined && statusCode >= 500)
}

function isClientErrorStatus(statusCode: number | undefined): boolean {
  return statusCode !== undefined && statusCode >= 400 && statusCode < 500
}

function classifyRetryError(
  error: RetryError,
  seen: SeenErrors,
  context: ErrorContext,
): AiDraftingErrorCode | null {
  for (let index = error.errors.length - 1; index >= 0; index -= 1) {
    const nestedError = error.errors[index]
    if (!isError(nestedError)) {
      continue
    }

    const nestedCode = classifyVercelAiError(nestedError, seen, context)
    if (nestedCode) {
      return nestedCode
    }
  }

  return error.reason === 'abort' || error.reason === 'maxRetriesExceeded'
    ? 'provider_unavailable'
    : null
}

function classifyNoObjectGeneratedError(
  error: NoObjectGeneratedError,
  seen: SeenErrors,
  context: ErrorContext,
): AiDraftingErrorCode {
  return (
    classifyCause(error.cause, seen, context)
    ?? (error.finishReason === 'content-filter' ? 'safety_rejected' : 'invalid_model_output')
  )
}

function classifyNoOutputGeneratedError(
  error: NoOutputGeneratedError,
  seen: SeenErrors,
  context: ErrorContext,
): AiDraftingErrorCode {
  return (
    classifyCause(error.cause, seen, context)
    ?? (context.finishReason === 'content-filter' ? 'safety_rejected' : 'invalid_model_output')
  )
}

function classifyCause(
  cause: unknown,
  seen: SeenErrors,
  context: ErrorContext,
): AiDraftingErrorCode | null {
  return isError(cause) ? classifyVercelAiError(cause, seen, context) : null
}

function classifyGenericError(
  error: Error,
  seen: SeenErrors,
  context: ErrorContext,
): AiDraftingErrorCode | null {
  if (isTimeoutError(error) || isNetworkError(error)) {
    return 'provider_unavailable'
  }

  return 'cause' in error ? classifyCause(error.cause, seen, context) : null
}

function isError(value: unknown): value is Error {
  return value instanceof Error
}

function isContextLengthErrorData(value: unknown): value is ProviderErrorData {
  const parsed = providerErrorDataSchema.safeParse(value)
  return parsed.success && parsed.data.error?.code === 'context_length_exceeded'
}

function isTimeoutError(error: Error): boolean {
  return error.name === 'AbortError' || error.name === 'TimeoutError'
}

function isNetworkError(error: Error): boolean {
  const code = networkErrorCodeSchema.safeParse(
    Object.getOwnPropertyDescriptor(error, 'code')?.value,
  )

  if (code.success) {
    return true
  }

  return (
    error instanceof TypeError
    && ['fetch failed', 'failed to fetch'].includes(error.message.toLowerCase())
  )
}

function getAiDraftingErrorMessage(code: AiDraftingErrorCode): string {
  return aiDraftingErrorMessages[code]
}
