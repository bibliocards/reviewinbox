import { z } from 'zod'

import type { AppleStoreAdapterErrorCode } from './types'

export class AppleStoreAdapterError extends Error {
  constructor(
    readonly code: AppleStoreAdapterErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'AppleStoreAdapterError'
  }
}

export function toAppleStoreAdapterError(status: number) {
  if (status === 401) {
    return new AppleStoreAdapterError(
      'apple_auth_failed',
      'Apple App Store credential is invalid.',
      status,
    )
  }
  if (status === 403) {
    return new AppleStoreAdapterError(
      'apple_forbidden',
      'Apple App Store credential cannot access reviews for this app.',
      status,
    )
  }
  if (status === 404) {
    return new AppleStoreAdapterError(
      'apple_not_found',
      'Apple App Store app was not found for this credential.',
      status,
    )
  }
  if (status === 429) {
    return new AppleStoreAdapterError(
      'apple_rate_limited',
      'Apple App Store review API rate limit was reached.',
      status,
    )
  }

  return new AppleStoreAdapterError(
    'apple_unavailable',
    'Apple App Store review API is unavailable.',
    status,
  )
}

const appleErrorCodesSchema = z.object({ errors: z.array(z.object({ code: z.string() })) })

export async function toAppleReviewReadError(response: Response): Promise<AppleStoreAdapterError> {
  if (response.status === 403) {
    const parsed = appleErrorCodesSchema.safeParse(await response.json().catch(() => null))
    if (
      parsed.success
      && parsed.data.errors.some(
        ({ code }) => code === 'FORBIDDEN.REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED',
      )
    ) {
      return new AppleStoreAdapterError(
        'apple_agreement_required',
        'A required Apple agreement is not in effect.',
        response.status,
      )
    }
  }
  return toAppleStoreAdapterError(response.status)
}
