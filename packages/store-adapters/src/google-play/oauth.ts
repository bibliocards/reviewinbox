import { z } from 'zod'

import { GooglePlayStoreAdapterError, toGooglePlayStoreAdapterError } from './errors'
import { createGoogleServiceAccountJwt } from './jwt'
import type { GooglePlayServiceAccountCredential } from './types'

const googleOAuthTokenUrl = 'https://oauth2.googleapis.com/token'
const defaultTimeoutMs = 20_000
const googleAccessTokenResponseSchema = z.object({ access_token: z.string().min(1) })

export async function createGoogleAccessToken(
  credential: GooglePlayServiceAccountCredential,
  timeoutMs?: number,
) {
  try {
    const response = await fetchWithTimeout(
      googleOAuthTokenUrl,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
        },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: createGoogleServiceAccountJwt(credential),
        }),
        redirect: 'error',
      },
      timeoutMs,
    )
    if (!response.ok) {
      throw toGooglePlayStoreAdapterError(response.status)
    }

    const parsed = googleAccessTokenResponseSchema.safeParse(await response.json())
    if (parsed.success) {
      return parsed.data.access_token
    }
    throw new GooglePlayStoreAdapterError(
      'google_invalid_response',
      'Google OAuth token response is invalid.',
    )
  } catch (error) {
    if (error instanceof GooglePlayStoreAdapterError) {
      throw error
    }
    throw new GooglePlayStoreAdapterError(
      'google_unavailable',
      'Google OAuth token API is unavailable.',
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
