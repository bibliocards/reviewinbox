import { readString } from '../common'
import { GooglePlayStoreAdapterError, toGooglePlayStoreAdapterError } from './errors'
import { createGoogleServiceAccountJwt } from './jwt'
import type { GooglePlayServiceAccountCredential } from './types'

const googleOAuthTokenUrl = 'https://oauth2.googleapis.com/token'
const defaultTimeoutMs = 20_000

export async function createGoogleAccessToken(credential: GooglePlayServiceAccountCredential, timeoutMs?: number) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs ?? defaultTimeoutMs)

  try {
    const response = await fetch(googleOAuthTokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: createGoogleServiceAccountJwt(credential),
      }),
      redirect: 'error',
      signal: controller.signal,
    })

    if (!response.ok) {
      throw toGooglePlayStoreAdapterError(response.status)
    }

    const body = (await response.json()) as unknown
    const accessToken = readAccessToken(body)
    if (!accessToken) {
      throw new GooglePlayStoreAdapterError('google_invalid_response', 'Google OAuth token response is invalid.')
    }

    return accessToken
  } catch (error) {
    if (error instanceof GooglePlayStoreAdapterError) {
      throw error
    }
    throw new GooglePlayStoreAdapterError('google_unavailable', 'Google OAuth token API is unavailable.')
  } finally {
    clearTimeout(timeout)
  }
}

function readAccessToken(value: unknown) {
  if (!value || typeof value !== 'object') {
    return null
  }

  return readString((value as Record<string, unknown>)['access_token'])
}
