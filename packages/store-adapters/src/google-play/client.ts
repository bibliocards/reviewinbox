import { getCheckpointReviewedAt } from '../common'
import type { NormalizedStoreReview, StoreReviewSyncResult } from '../index'
import { GooglePlayStoreAdapterError, toGooglePlayStoreAdapterError } from './errors'
import { normalizeGooglePlayReview } from './normalize'
import { createGoogleAccessToken } from './oauth'
import type { GooglePlayCredentialVerificationResult, GooglePlayReviewSyncRequest, GooglePlayReviewsResponse } from './types'

const googleReviewsBaseUrl = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications'
const defaultTimeoutMs = 20_000
const defaultPageLimit = 100
const defaultMaxPages = 10

export async function verifyGooglePlayCredentialForApp(input: {
  packageName: string
  credential: GooglePlayReviewSyncRequest['credential']
  timeoutMs?: number
}): Promise<GooglePlayCredentialVerificationResult> {
  try {
    await fetchGooglePlayReviewsPage({
      packageName: input.packageName,
      credential: input.credential,
      maxResults: 1,
      ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
    })

    return { ok: true }
  } catch (error) {
    if (error instanceof GooglePlayStoreAdapterError) {
      return { ok: false, errorCode: error.code, ...(error.status !== undefined ? { status: error.status } : {}) }
    }

    return { ok: false, errorCode: 'google_unavailable' }
  }
}

export async function syncGooglePlayReviews(input: GooglePlayReviewSyncRequest): Promise<StoreReviewSyncResult> {
  const maxPages = input.maxPages ?? defaultMaxPages
  const pageLimit = input.pageLimit ?? defaultPageLimit
  const reviews: NormalizedStoreReview[] = []
  let nextPageToken: string | null = null
  let newestReviewedAt = getCheckpointReviewedAt(input.checkpoint)

  for (let page = 0; page < maxPages; page += 1) {
    const response = await fetchGooglePlayReviewsPage({
      packageName: input.packageName,
      credential: input.credential,
      maxResults: pageLimit,
      ...(nextPageToken ? { token: nextPageToken } : {}),
      ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
    })

    for (const resource of response.reviews ?? []) {
      const normalized = normalizeGooglePlayReview(resource)
      if (!normalized) {
        continue
      }

      reviews.push(normalized)
      if (!newestReviewedAt || normalized.reviewedAt > newestReviewedAt) {
        newestReviewedAt = normalized.reviewedAt
      }
    }

    nextPageToken = response.tokenPagination?.nextPageToken ?? null
    if (!nextPageToken) {
      break
    }
  }

  return {
    reviews,
    checkpoint: newestReviewedAt ? { lastReviewedAt: newestReviewedAt } : input.checkpoint,
  }
}

async function fetchGooglePlayReviewsPage(input: {
  packageName: string
  credential: GooglePlayReviewSyncRequest['credential']
  maxResults: number
  token?: string
  timeoutMs?: number
}): Promise<GooglePlayReviewsResponse> {
  const accessToken = await createGoogleAccessToken(input.credential, input.timeoutMs)
  const url = new URL(`${googleReviewsBaseUrl}/${encodeURIComponent(input.packageName)}/reviews`)
  url.searchParams.set('maxResults', String(input.maxResults))
  if (input.token) {
    url.searchParams.set('token', input.token)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? defaultTimeoutMs)

  try {
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
      redirect: 'error',
      signal: controller.signal,
    })

    if (!response.ok) {
      throw toGooglePlayStoreAdapterError(response.status)
    }

    const body = (await response.json()) as unknown
    return parseGooglePlayReviewsResponse(body)
  } catch (error) {
    if (error instanceof GooglePlayStoreAdapterError) {
      throw error
    }
    throw new GooglePlayStoreAdapterError('google_unavailable', 'Google Play review API is unavailable.')
  } finally {
    clearTimeout(timeout)
  }
}

function parseGooglePlayReviewsResponse(value: unknown): GooglePlayReviewsResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new GooglePlayStoreAdapterError('google_invalid_response', 'Google Play review API returned an invalid response.')
  }

  return value as GooglePlayReviewsResponse
}
