import { createPrivateKey, sign } from 'node:crypto'

import { AppleStoreAdapterError } from './errors'
import type { AppleAppStoreCredential } from './types'

const appleJwtAudience = 'appstoreconnect-v1'

export function createAppleAppStoreConnectJwt(credential: AppleAppStoreCredential) {
  const now = Math.floor(Date.now() / 1000)
  const header = base64UrlJson({ alg: 'ES256', kid: credential.keyId, typ: 'JWT' })
  const payload = base64UrlJson({ iss: credential.issuerId, aud: appleJwtAudience, iat: now, exp: now + 20 * 60 })
  const signingInput = `${header}.${payload}`
  const signature = sign('sha256', Buffer.from(signingInput), createPrivateKey(credential.privateKey))

  return `${signingInput}.${derSignatureToJose(signature)}`
}

function base64UrlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function derSignatureToJose(signature: Buffer) {
  if (signature[0] !== 0x30) {
    throw new AppleStoreAdapterError('apple_auth_failed', 'Apple credential signing failed.')
  }

  const rStart = 4
  const rLength = signature[3]
  if (rLength == null) {
    throw new AppleStoreAdapterError('apple_auth_failed', 'Apple credential signing failed.')
  }
  const sLengthIndex = rStart + rLength + 1
  const sLength = signature[sLengthIndex]
  if (sLength == null) {
    throw new AppleStoreAdapterError('apple_auth_failed', 'Apple credential signing failed.')
  }

  const r = signature.subarray(rStart, rStart + rLength)
  const s = signature.subarray(sLengthIndex + 1, sLengthIndex + 1 + sLength)
  return Buffer.concat([leftPadSignaturePart(r), leftPadSignaturePart(s)]).toString('base64url')
}

function leftPadSignaturePart(part: Buffer) {
  const trimmed = part[0] === 0 ? part.subarray(1) : part
  if (trimmed.length > 32) {
    throw new AppleStoreAdapterError('apple_auth_failed', 'Apple credential signing failed.')
  }

  return Buffer.concat([Buffer.alloc(32 - trimmed.length), trimmed])
}
