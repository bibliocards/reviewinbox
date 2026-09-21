import { z } from 'zod'

import { AppleStoreAdapterError, toAppleStoreAdapterError } from './errors'
import { createAppleAppStoreConnectJwt } from './jwt'
import { assertAppleVersionQuota, recordAppleRateLimit } from './rate-limit'
import type { AppleAppStoreCredential } from './types'

const api = 'https://api.appstoreconnect.apple.com/v1'
const versionSchema = z.object({
  id: z.string().min(1),
  attributes: z.object({ versionString: z.string().min(1) }),
})
const linksSchema = z.object({ next: z.string().nullish() }).optional()
const versionsSchema = z.object({ data: z.array(versionSchema), links: linksSchema })
const reviewsSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      attributes: z.object({ title: z.string().optional(), body: z.string(), rating: z.number() }),
    }),
  ),
  links: linksSchema,
})
export const appleVersionLookupCursorSchema = z.object({
  versionsUrl: z.string().nullable(),
  versions: z.array(z.object({ id: z.string(), version: z.string() })),
  reviewsUrl: z.string().nullable(),
})
export type AppleVersionLookupCursor = z.infer<typeof appleVersionLookupCursorSchema>
export type AppleVersionMatch = {
  externalReviewId: string
  version: string
  title: string | null
  body: string
  rating: number
}
export type AppleVersionLookupPage = {
  cursor: AppleVersionLookupCursor | null
  matches: AppleVersionMatch[]
}

export function createAppleVersionLookupCursor(appId: string): AppleVersionLookupCursor {
  return {
    versionsUrl: `${api}/apps/${encodeURIComponent(appId)}/appStoreVersions?filter%5Bplatform%5D=IOS&fields%5BappStoreVersions%5D=versionString&limit=200`,
    versions: [],
    reviewsUrl: null,
  }
}

export async function readAppleVersionLookupPage(input: {
  credential: AppleAppStoreCredential
  cursor: AppleVersionLookupCursor
  signal?: AbortSignal
}): Promise<AppleVersionLookupPage> {
  const current = input.cursor.versions[0]
  if (current === undefined) {
    return readVersions(input)
  }
  const url =
    input.cursor.reviewsUrl
    ?? `${api}/appStoreVersions/${encodeURIComponent(current.id)}/customerReviews?fields%5BcustomerReviews%5D=title,body,rating&limit=200`
  const page = await requestPage(url, input, reviewsSchema)
  const next = normalizeNext(page.links?.next)
  const cursor = {
    ...input.cursor,
    reviewsUrl: next,
    versions: next === null ? input.cursor.versions.slice(1) : input.cursor.versions,
  }
  return {
    cursor: finished(cursor) ? null : cursor,
    matches: page.data.map((review) => ({
      externalReviewId: review.id,
      version: current.version,
      title: review.attributes.title ?? null,
      body: review.attributes.body,
      rating: review.attributes.rating,
    })),
  }
}

async function readVersions(input: {
  credential: AppleAppStoreCredential
  cursor: AppleVersionLookupCursor
  signal?: AbortSignal
}): Promise<AppleVersionLookupPage> {
  if (input.cursor.versionsUrl === null) {
    return { cursor: null, matches: [] }
  }
  const page = await requestPage(input.cursor.versionsUrl, input, versionsSchema)
  const cursor = {
    versionsUrl: normalizeNext(page.links?.next),
    versions: page.data.map((version) => ({
      id: version.id,
      version: version.attributes.versionString,
    })),
    reviewsUrl: null,
  }
  return { cursor: finished(cursor) ? null : cursor, matches: [] }
}

function finished(cursor: AppleVersionLookupCursor): boolean {
  return cursor.versions.length === 0 && cursor.versionsUrl === null
}

async function requestPage<T>(
  url: string,
  input: { credential: AppleAppStoreCredential; signal?: AbortSignal },
  schema: z.ZodType<T>,
): Promise<T> {
  const parsed = new URL(url)
  if (
    parsed.origin !== 'https://api.appstoreconnect.apple.com'
    || parsed.username !== ''
    || parsed.password !== ''
  ) {
    throw new AppleStoreAdapterError('apple_invalid_response', 'Invalid Apple pagination URL.')
  }
  assertAppleVersionQuota(input.credential)
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${createAppleAppStoreConnectJwt(input.credential)}`,
      accept: 'application/json',
    },
    redirect: 'error',
    signal:
      input.signal === undefined
        ? AbortSignal.timeout(20_000)
        : AbortSignal.any([input.signal, AbortSignal.timeout(20_000)]),
  })
  recordAppleRateLimit(input.credential, response)
  if (response.status === 429) {
    assertAppleVersionQuota(input.credential)
  }
  if (!response.ok) {
    throw toAppleStoreAdapterError(response.status)
  }
  return schema.parse(await response.json())
}

function normalizeNext(next: string | null | undefined): string | null {
  return next === undefined || next === '' ? null : next
}
