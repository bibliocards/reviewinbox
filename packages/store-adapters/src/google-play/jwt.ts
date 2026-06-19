import { createPrivateKey, sign } from 'node:crypto'

import type { GooglePlayServiceAccountCredential } from './types'

const googleOAuthTokenUrl = 'https://oauth2.googleapis.com/token'
const androidPublisherScope = 'https://www.googleapis.com/auth/androidpublisher'

export function createGoogleServiceAccountJwt(credential: GooglePlayServiceAccountCredential) {
  const now = Math.floor(Date.now() / 1000)
  const header = base64UrlJson({ alg: 'RS256', typ: 'JWT' })
  const payload = base64UrlJson({
    iss: credential.client_email,
    scope: androidPublisherScope,
    aud: googleOAuthTokenUrl,
    iat: now,
    exp: now + 60 * 60,
  })
  const signingInput = `${header}.${payload}`
  const signature = sign('RSA-SHA256', Buffer.from(signingInput), createPrivateKey(credential.private_key))

  return `${signingInput}.${signature.toString('base64url')}`
}

function base64UrlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}
