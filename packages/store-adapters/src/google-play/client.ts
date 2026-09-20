import { z } from 'zod'

import { getCheckpointReviewedAt } from '../common'
import type {
  NormalizedStoreReview,
  StoreReplyPublishResult,
  StoreReviewSyncResult,
} from '../index'
import { GooglePlayStoreAdapterError, toGooglePlayStoreAdapterError } from './errors'
import { normalizeGooglePlayReview } from './normalize'
import { createGoogleAccessToken } from './oauth'
import { googlePlayReplyPublishResponseSchema, googlePlayReviewsResponseSchema } from './types'
import type {
  GooglePlayCredentialVerificationResult,
  GooglePlayReplyPublishRequest,
  GooglePlayReviewSyncRequest,
  GooglePlayReviewsResponse,
  GoogleTimestamp,
} from './types'

const googleReviewsBaseUrl =
  'https://androidpublisher.googleapis.com/androidpublisher/v3/applications'
const defaultTimeoutMs = 20_000
const defaultPageLimit = 100
const defaultMaxPages = 10

export async function verifyGooglePlayCredentialForApp(input: {
  packageName: string
  credential: GooglePlayReviewSyncRequest['credential']
  timeoutMs?: number
}): Promise<GooglePlayCredentialVerificationResult> {
  try {
    const accessToken = await createGoogleAccessToken(input.credential, input.timeoutMs)
    const pageInput: Parameters<typeof fetchGooglePlayReviewsPage>[0] = {
      packageName: input.packageName,
      accessToken,
      maxResults: 1,
    }
    if (input.timeoutMs !== undefined) {
      pageInput.timeoutMs = input.timeoutMs
    }
    await fetchGooglePlayReviewsPage(pageInput)
    return { ok: true }
  } catch (error) {
    if (error instanceof GooglePlayStoreAdapterError) {
      if (error.status === undefined) {
        return { ok: false, errorCode: error.code }
      }
      return { ok: false, errorCode: error.code, status: error.status }
    }
    return { ok: false, errorCode: 'google_unavailable' }
  }
}

export async function syncGooglePlayReviews(
  input: GooglePlayReviewSyncRequest,
): Promise<StoreReviewSyncResult> {
  const state: GoogleReviewPageState = {
    packageName: input.packageName,
    accessToken: await createGoogleAccessToken(input.credential, input.timeoutMs),
    maxResults: input.pageLimit ?? defaultPageLimit,
    maxPages: input.maxPages ?? defaultMaxPages,
    nextPageToken: null,
    page: 0,
    reviews: [],
    newestReviewedAt: getCheckpointReviewedAt(input.checkpoint),
  }
  if (input.timeoutMs !== undefined) {
    state.timeoutMs = input.timeoutMs
  }
  const result = await fetchGoogleReviewPages(state)

  return {
    reviews: result.reviews,
    checkpoint:
      result.newestReviewedAt === null
        ? input.checkpoint
        : { lastReviewedAt: result.newestReviewedAt },
  }
}

export async function publishGooglePlayReply(
  input: GooglePlayReplyPublishRequest,
): Promise<StoreReplyPublishResult> {
  try {
    const accessToken = await createGoogleAccessToken(input.credential, input.timeoutMs)
    const url = new URL(
      `${googleReviewsBaseUrl}/${encodeURIComponent(input.packageName)}/reviews/${encodeURIComponent(input.externalReviewId)}:reply`,
    )
    const response = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          accept: 'application/json',
          'content-type': 'application/json',
        },
        redirect: 'error',
        body: JSON.stringify({ replyText: input.replyText }),
      },
      input.timeoutMs,
    )
    if (!response.ok) {
      throw toGooglePlayStoreAdapterError(response.status)
    }

    return await parseGoogleReplyPublishResponse(response)
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new GooglePlayStoreAdapterError(
        'google_invalid_response',
        'Google Play review API returned an invalid response.',
      )
    }
    if (error instanceof GooglePlayStoreAdapterError) {
      throw error
    }
    throw new GooglePlayStoreAdapterError(
      'google_unavailable',
      'Google Play review API is unavailable.',
    )
  }
}

type GoogleReviewPageState = {
  packageName: string
  accessToken: string
  maxResults: number
  maxPages: number
  nextPageToken: string | null
  page: number
  reviews: NormalizedStoreReview[]
  newestReviewedAt: string | null
  timeoutMs?: number
}

async function fetchGoogleReviewPages(
  state: GoogleReviewPageState,
): Promise<GoogleReviewPageState> {
  if (
    state.page >= state.maxPages
    || (state.page > 0 && (state.nextPageToken === null || state.nextPageToken.length === 0))
  ) {
    return state
  }

  const pageInput: Parameters<typeof fetchGooglePlayReviewsPage>[0] = {
    packageName: state.packageName,
    accessToken: state.accessToken,
    maxResults: state.maxResults,
  }
  if (state.nextPageToken !== null) {
    pageInput.token = state.nextPageToken
  }
  if (state.timeoutMs !== undefined) {
    pageInput.timeoutMs = state.timeoutMs
  }

  const collected = collectGoogleReviews(state, await fetchGooglePlayReviewsPage(pageInput))
  return fetchGoogleReviewPages({
    ...state,
    nextPageToken: collected.nextPageToken,
    page: state.page + 1,
    reviews: collected.reviews,
    newestReviewedAt: collected.newestReviewedAt,
  })
}

function collectGoogleReviews(state: GoogleReviewPageState, response: GooglePlayReviewsResponse) {
  const reviews = [...state.reviews]
  let newestReviewedAt = state.newestReviewedAt
  for (const resource of response.reviews ?? []) {
    const normalized = normalizeGooglePlayReview(resource)
    if (normalized === null) {
      continue
    }
    reviews.push(normalized)
    if (newestReviewedAt === null || normalized.reviewedAt > newestReviewedAt) {
      newestReviewedAt = normalized.reviewedAt
    }
  }
  return {
    reviews,
    newestReviewedAt,
    nextPageToken: response.tokenPagination?.nextPageToken ?? null,
  }
}

async function fetchGooglePlayReviewsPage(input: {
  packageName: string
  accessToken: string
  maxResults: number
  token?: string
  timeoutMs?: number
}): Promise<GooglePlayReviewsResponse> {
  const url = buildGoogleReviewsPageUrl(input)

  try {
    const response = await fetchWithTimeout(
      url,
      {
        headers: { authorization: `Bearer ${input.accessToken}`, accept: 'application/json' },
        redirect: 'error',
      },
      input.timeoutMs,
    )
    if (!response.ok) {
      throw toGooglePlayStoreAdapterError(response.status)
    }

    return googlePlayReviewsResponseSchema.parse(await response.json())
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new GooglePlayStoreAdapterError(
        'google_invalid_response',
        'Google Play review API returned an invalid response.',
      )
    }
    if (error instanceof GooglePlayStoreAdapterError) {
      throw error
    }
    throw new GooglePlayStoreAdapterError(
      'google_unavailable',
      'Google Play review API is unavailable.',
    )
  }
}

function buildGoogleReviewsPageUrl(input: {
  packageName: string
  maxResults: number
  token?: string
}) {
  const url = new URL(`${googleReviewsBaseUrl}/${encodeURIComponent(input.packageName)}/reviews`)
  url.searchParams.set('maxResults', String(input.maxResults))
  if (input.token !== undefined) {
    url.searchParams.set('token', input.token)
  }
  return url
}

async function parseGoogleReplyPublishResponse(
  response: Response,
): Promise<StoreReplyPublishResult> {
  const parsed = googlePlayReplyPublishResponseSchema.parse(await response.json())
  return {
    externalReplyId: null,
    publishedAt: googleTimestampToIso(parsed.result?.lastEdited) ?? new Date().toISOString(),
  }
}

function googleTimestampToIso(value: GoogleTimestamp | undefined) {
  if (value === undefined) {
    return null
  }
  const seconds = Number(value.seconds ?? Number.NaN)
  if (!Number.isFinite(seconds)) {
    return null
  }
  const nanos = value.nanos ?? 0
  return new Date(seconds * 1000 + Math.floor(nanos / 1_000_000)).toISOString()
}

async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit,
  timeoutMs: number | undefined,
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort()
  }, timeoutMs ?? defaultTimeoutMs)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}
