import { describe, expect, it } from 'vitest'

import { healthResponseSchema } from './index'

describe('healthResponseSchema', () => {
  it('accepts the health payload shape', () => {
    expect(
      healthResponseSchema.parse({
        ok: true,
        service: 'api',
        checkedAt: '2026-06-18T12:00:00.000Z',
      }),
    ).toEqual({
      ok: true,
      service: 'api',
      checkedAt: '2026-06-18T12:00:00.000Z',
    })
  })
})
