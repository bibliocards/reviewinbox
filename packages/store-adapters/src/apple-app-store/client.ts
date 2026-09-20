import { z } from 'zod'

import { getCheckpointReviewedAt } from '../common'
import type {
  NormalizedStoreReview,
  StoreReplyPublishResult,
  StoreReviewSyncResult,
} from '../index'
import { AppleStoreAdapterError, toAppleStoreAdapterError } from './errors'
import { createAppleAppStoreConnectJwt } from './jwt'
import { normalizeAppleReview } from './normalize'
import { appleCustomerReviewResponseSchema, appleCustomerReviewsResponseSchema } from './types'
import type {
  AppleCredentialVerificationResult,
  AppleCustomerReviewsResponse,
  AppleReplyPublishRequest,
  AppleReviewSyncRequest,
} from './types'

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
    const pageInput: Parameters<typeof fetchAppleCustomerReviewsPage>[0] = {
      appStoreAppId: input.appStoreAppId,
      credential: input.credential,
      limit: 1,
    }
    if (input.timeoutMs !== undefined) {
      pageInput.timeoutMs = input.timeoutMs
    }
    await fetchAppleCustomerReviewsPage(pageInput)
    return { ok: true }
  } catch (error) {
    if (error instanceof AppleStoreAdapterError) {
      if (error.status === undefined) {
        return { ok: false, errorCode: error.code }
      }
      return { ok: false, errorCode: error.code, status: error.status }
    }
    return { ok: false, errorCode: 'apple_unavailable' }
  }
}

export async function syncAppleAppStoreReviews(
  input: AppleReviewSyncRequest,
): Promise<StoreReviewSyncResult> {
  const pageLimit = input.pageLimit ?? defaultPageLimit
  const state: AppleReviewPageState = {
    appStoreAppId: input.appStoreAppId,
    credential: input.credential,
    limit: pageLimit,
    maxPages: input.maxPages ?? defaultMaxPages,
    nextUrl: buildCustomerReviewsUrl(input.appStoreAppId, pageLimit),
    page: 0,
    reviews: [],
    newestReviewedAt: getCheckpointReviewedAt(input.checkpoint),
  }
  if (input.timeoutMs !== undefined) {
    state.timeoutMs = input.timeoutMs
  }
  const result = await fetchAppleReviewPages(state)

  return {
    reviews: result.reviews,
    checkpoint:
      result.newestReviewedAt === null
        ? input.checkpoint
        : { lastReviewedAt: result.newestReviewedAt },
  }
}

export async function publishAppleAppStoreReply(
  input: AppleReplyPublishRequest,
): Promise<StoreReplyPublishResult> {
  try {
    const response = await fetchWithTimeout(
      `${appleApiBaseUrl}/customerReviewResponses`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${createAppleAppStoreConnectJwt(input.credential)}`,
          accept: 'application/json',
          'content-type': 'application/json',
        },
        redirect: 'error',
        body: JSON.stringify({
          data: {
            type: 'customerReviewResponses',
            attributes: { responseBody: input.replyText },
            relationships: {
              review: { data: { type: 'customerReviews', id: input.externalReviewId } },
            },
          },
        }),
      },
      input.timeoutMs,
    )
    if (!response.ok) {
      throw toAppleStoreAdapterError(response.status)
    }

    const parsed = appleCustomerReviewResponseSchema.parse(await response.json())
    return { externalReplyId: parsed.data.id ?? null, publishedAt: new Date().toISOString() }
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AppleStoreAdapterError(
        'apple_invalid_response',
        'Apple App Store review API returned an invalid response.',
      )
    }
    if (error instanceof AppleStoreAdapterError) {
      throw error
    }
    throw new AppleStoreAdapterError(
      'apple_unavailable',
      'Apple App Store review API is unavailable.',
    )
  }
}

function buildCustomerReviewsUrl(appStoreAppId: string, limit: number) {
  const url = new URL(
    `${appleApiBaseUrl}/apps/${encodeURIComponent(appStoreAppId)}/customerReviews`,
  )
  url.searchParams.set('include', 'response')
  url.searchParams.set('sort', '-createdDate')
  url.searchParams.set('limit', String(limit))
  return url.toString()
}

type AppleReviewPageState = {
  appStoreAppId: string
  credential: AppleReviewSyncRequest['credential']
  limit: number
  maxPages: number
  nextUrl: string | null
  page: number
  reviews: NormalizedStoreReview[]
  newestReviewedAt: string | null
  timeoutMs?: number
}

async function fetchAppleReviewPages(state: AppleReviewPageState): Promise<AppleReviewPageState> {
  if (state.nextUrl === null || state.nextUrl.length === 0 || state.page >= state.maxPages) {
    return state
  }

  const pageInput: Parameters<typeof fetchAppleCustomerReviewsPage>[0] = {
    appStoreAppId: state.appStoreAppId,
    credential: state.credential,
    limit: state.limit,
    url: state.nextUrl,
  }
  if (state.timeoutMs !== undefined) {
    pageInput.timeoutMs = state.timeoutMs
  }

  const response = await fetchAppleCustomerReviewsPage(pageInput)
  const collected = collectAppleReviews(state, response)

  return fetchAppleReviewPages({
    ...state,
    nextUrl: response.links?.next ?? null,
    page: state.page + 1,
    reviews: collected.reviews,
    newestReviewedAt: collected.newestReviewedAt,
  })
}

function collectAppleReviews(state: AppleReviewPageState, response: AppleCustomerReviewsResponse) {
  const reviews = [...state.reviews]
  let newestReviewedAt = state.newestReviewedAt
  for (const resource of response.data) {
    const normalized = normalizeAppleReview(resource)
    reviews.push(normalized)
    if (newestReviewedAt === null || normalized.reviewedAt > newestReviewedAt) {
      newestReviewedAt = normalized.reviewedAt
    }
  }
  return { reviews, newestReviewedAt }
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

  try {
    const response = await fetchWithTimeout(
      url,
      {
        headers: {
          authorization: `Bearer ${createAppleAppStoreConnectJwt(input.credential)}`,
          accept: 'application/json',
        },
        redirect: 'error',
      },
      input.timeoutMs,
    )
    if (!response.ok) {
      throw toAppleStoreAdapterError(response.status)
    }

    return appleCustomerReviewsResponseSchema.parse(await response.json())
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AppleStoreAdapterError(
        'apple_invalid_response',
        'Apple App Store review API returned an invalid response.',
      )
    }
    if (error instanceof AppleStoreAdapterError) {
      throw error
    }
    throw new AppleStoreAdapterError(
      'apple_unavailable',
      'Apple App Store review API is unavailable.',
    )
  }
}

function assertAppleApiUrl(value: string) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.hostname !== 'api.appstoreconnect.apple.com') {
    throw new AppleStoreAdapterError(
      'apple_unavailable',
      'Apple App Store review API URL is invalid.',
    )
  }
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
