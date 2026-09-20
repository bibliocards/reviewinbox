import { describe, expect, it } from 'vitest'

import { betterAuthErrorKey } from './better-auth-errors'

describe('betterAuthErrorKey', () => {
  it('reads direct, body, and nested error codes', () => {
    const expected = 'organization.members.errors.alreadyMember'

    expect(betterAuthErrorKey({ code: 'USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION' })).toBe(
      expected,
    )
    expect(
      betterAuthErrorKey({ body: { code: 'USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION' } }),
    ).toBe(expected)
    expect(
      betterAuthErrorKey({ error: { code: 'USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION' } }),
    ).toBe(expected)
  })

  it('uses the generic or provided fallback for invalid and unknown errors', () => {
    expect(betterAuthErrorKey(null)).toBe('errors.generic')
    expect(betterAuthErrorKey({ code: 'UNKNOWN_ERROR' }, 'custom.fallback')).toBe('custom.fallback')
    expect(betterAuthErrorKey({ body: { code: 42 } })).toBe('errors.generic')
  })

  it('does not treat inherited keys as known error codes', () => {
    expect(betterAuthErrorKey({ code: 'constructor' }, 'custom.fallback')).toBe('custom.fallback')
  })
})
