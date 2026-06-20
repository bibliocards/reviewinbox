import { getCheckpointReviewedAt } from '../common'
import type { NormalizedStoreReview, StoreReviewSyncResult } from '../index'
import { AppleStoreAdapterError, toAppleStoreAdapterError } from './errors'
import { createAppleAppStoreConnectJwt } from './jwt'
import { normalizeAppleReview } from './normalize'
import type { AppleCredentialVerificationResult, AppleCustomerReviewsResponse, AppleReviewSyncRequest } from './types'

const appleApiBaseUrl = 'https://api.appstoreconnect.apple.com/v1'
const defaultTimeoutMs = 20_000
const defaultPageLimit = 200
const defaultMaxPages = 10

export async function verifyAppleCredentialForApp(input: {
  appStoreAppId: string
  credential: AppleReviewSyncRequest['credential']
  timeoutMs?: number
}): Promise<AppleCredentialVerificationResult> {
  try {
    await fetchAppleCustomerReviewsPage({
      appStoreAppId: input.appStoreAppId,
      credential: input.credential,
      limit: 1,
      ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
    })

    return { ok: true }
  } catch (error) {
    if (error instanceof AppleStoreAdapterError) {
      return { ok: false, errorCode: error.code, ...(error.status !== undefined ? { status: error.status } : {}) }
    }

    return { ok: false, errorCode: 'apple_unavailable' }
  }
}

export async function syncAppleAppStoreReviews(input: AppleReviewSyncRequest): Promise<StoreReviewSyncResult> {
  const maxPages = input.maxPages ?? defaultMaxPages
  const pageLimit = input.pageLimit ?? defaultPageLimit
  let nextUrl: string | null = buildCustomerReviewsUrl(input.appStoreAppId, pageLimit)
  const reviews: NormalizedStoreReview[] = []
  let newestReviewedAt = getCheckpointReviewedAt(input.checkpoint)

  for (let page = 0; nextUrl && page < maxPages; page += 1) {
    const response = await fetchAppleCustomerReviewsPage({
      appStoreAppId: input.appStoreAppId,
      credential: input.credential,
      limit: pageLimit,
      url: nextUrl,
      ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
    })

    for (const resource of response.data) {
      const normalized = normalizeAppleReview(resource)
      reviews.push(normalized)
      if (!newestReviewedAt || normalized.reviewedAt > newestReviewedAt) {
        newestReviewedAt = normalized.reviewedAt
      }
    }

    nextUrl = response.links?.next ?? null
  }

  return {
    reviews,
    checkpoint: newestReviewedAt ? { lastReviewedAt: newestReviewedAt } : input.checkpoint,
  }
}

function buildCustomerReviewsUrl(appStoreAppId: string, limit: number) {
  const url = new URL(`${appleApiBaseUrl}/apps/${encodeURIComponent(appStoreAppId)}/customerReviews`)
  url.searchParams.set('limit', String(limit))
  return url.toString()
}

async function fetchAppleCustomerReviewsPage(input: {
  appStoreAppId: string
  credential: AppleReviewSyncRequest['credential']
  limit: number
  url?: string
  timeoutMs?: number
}): Promise<AppleCustomerReviewsResponse> {
  const url = input.url ?? buildCustomerReviewsUrl(input.appStoreAppId, input.limit)
  assertAppleApiUrl(url)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? defaultTimeoutMs)

  try {
    const response = await fetch(url, {
      headers: {
        authorization: `Bearer ${createAppleAppStoreConnectJwt(input.credential)}`,
        accept: 'application/json',
      },
      redirect: 'error',
      signal: controller.signal,
    })

    if (!response.ok) {
      throw toAppleStoreAdapterError(response.status)
    }

    const body = (await response.json()) as unknown
    return parseCustomerReviewsResponse(body)
  } catch (error) {
    if (error instanceof AppleStoreAdapterError) {
      throw error
    }
    throw new AppleStoreAdapterError('apple_unavailable', 'Apple App Store review API is unavailable.')
  } finally {
    clearTimeout(timeout)
  }
}

function assertAppleApiUrl(value: string) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.hostname !== 'api.appstoreconnect.apple.com') {
    throw new AppleStoreAdapterError('apple_unavailable', 'Apple App Store review API URL is invalid.')
  }
}

function parseCustomerReviewsResponse(value: unknown): AppleCustomerReviewsResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AppleStoreAdapterError('apple_invalid_response', 'Apple App Store review API returned an invalid response.')
  }

  const response = value as Partial<AppleCustomerReviewsResponse>
  if (!Array.isArray(response.data)) {
    throw new AppleStoreAdapterError('apple_invalid_response', 'Apple App Store review API returned an invalid response.')
  }

  return { data: response.data, ...(response.links ? { links: response.links } : {}) }
}
