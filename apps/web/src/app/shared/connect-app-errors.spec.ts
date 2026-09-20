import { describe, expect, it } from 'vitest'

import { connectAppErrorMessageKey } from './connect-app-errors'

describe('connectAppErrorMessageKey', () => {
  it('reads direct and HTTP-style nested error bodies', () => {
    const expected = 'apps.connectDialog.errors.appleAuthFailed'
    const fallback = 'apps.connectDialog.errors.createFailed'

    expect(connectAppErrorMessageKey({ errorCode: 'apple_auth_failed' }, fallback)).toBe(expected)
    expect(connectAppErrorMessageKey({ error: { errorCode: 'apple_auth_failed' } }, fallback)).toBe(
      expected,
    )
  })

  it('uses the fallback for unknown and inherited error codes', () => {
    const fallback = 'apps.connectDialog.errors.createFailed'

    expect(connectAppErrorMessageKey({ errorCode: 'unknown_error' }, fallback)).toBe(fallback)
    expect(connectAppErrorMessageKey({ errorCode: 'constructor' }, fallback)).toBe(fallback)
    expect(connectAppErrorMessageKey({ error: {} }, fallback)).toBe(fallback)
    expect(connectAppErrorMessageKey(null, fallback)).toBe(fallback)
    expect(connectAppErrorMessageKey('network error', fallback)).toBe(fallback)
  })
})
