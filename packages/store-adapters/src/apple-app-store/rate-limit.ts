import { createHash } from 'node:crypto'

import { AppleStoreAdapterError } from './errors'
import type { AppleAppStoreCredential } from './types'

const activeIngestions = new Map<string, number>()
const pausedUntil = new Map<string, number>()
const hourMs = 60 * 60 * 1000

export function appleCredentialQuotaKey(credential: AppleAppStoreCredential): string {
  return createHash('sha256').update(`${credential.issuerId}:${credential.keyId}`).digest('hex')
}

export class AppleVersionQuotaError extends AppleStoreAdapterError {
  constructor(readonly retryAt: number) {
    super('apple_rate_limited', 'Apple version lookup is waiting for API quota.')
  }
}

export function assertAppleVersionQuota(credential: AppleAppStoreCredential): void {
  const key = appleCredentialQuotaKey(credential)
  if ((activeIngestions.get(key) ?? 0) > 0) {
    throw new AppleVersionQuotaError(Date.now() + 60_000)
  }
  const until = pausedUntil.get(key) ?? 0
  if (until > Date.now()) {
    throw new AppleVersionQuotaError(until)
  }
  pausedUntil.delete(key)
}

export function recordAppleRateLimit(
  credential: AppleAppStoreCredential,
  response: Response,
): void {
  const header = response.headers.get('X-Rate-Limit') ?? ''
  const limit = Number(/user-hour-lim:(\d+)/u.exec(header)?.[1])
  const remaining = Number(/user-hour-rem:(\d+)/u.exec(header)?.[1])
  const reserve = Math.max(1, Math.ceil(limit * 0.1))
  if (response.status === 429 || (Number.isFinite(limit) && remaining <= reserve)) {
    const retry = response.headers.get('Retry-After')
    const delay = retry === null ? hourMs : retryDelay(retry)
    pausedUntil.set(appleCredentialQuotaKey(credential), Date.now() + delay)
  }
}

function retryDelay(value: string): number {
  const seconds = Number(value)
  if (Number.isFinite(seconds)) {
    return Math.max(1000, seconds * 1000)
  }
  const date = Date.parse(value)
  return Number.isFinite(date) ? Math.max(1000, date - Date.now()) : hourMs
}

export async function withAppleIngestionPriority<T>(
  credential: AppleAppStoreCredential,
  run: () => Promise<T>,
): Promise<T> {
  const key = appleCredentialQuotaKey(credential)
  activeIngestions.set(key, (activeIngestions.get(key) ?? 0) + 1)
  try {
    return await run()
  } finally {
    const remaining = (activeIngestions.get(key) ?? 1) - 1
    if (remaining === 0) {
      activeIngestions.delete(key)
    } else {
      activeIngestions.set(key, remaining)
    }
  }
}
