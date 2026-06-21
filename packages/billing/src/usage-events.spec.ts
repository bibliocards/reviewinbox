import { describe, expect, it } from 'vitest'

import { createUsageEvent } from './usage-events'

describe('createUsageEvent', () => {
  it('accepts positive integer quantities', () => {
    const occurredAt = new Date('2026-06-21T12:00:00.000Z')

    expect(
      createUsageEvent({
        organizationId: 'org_1',
        type: 'review_imported',
        quantity: 1,
        occurredAt,
      }),
    ).toEqual({
      organizationId: 'org_1',
      type: 'review_imported',
      quantity: 1,
      occurredAt,
    })
  })

  it('rejects zero and fractional quantities', () => {
    expect(() =>
      createUsageEvent({
        organizationId: 'org_1',
        type: 'review_imported',
        quantity: 0,
        occurredAt: new Date(),
      }),
    ).toThrow(/positive integer/)
    expect(() =>
      createUsageEvent({
        organizationId: 'org_1',
        type: 'review_imported',
        quantity: 1.5,
        occurredAt: new Date(),
      }),
    ).toThrow(/positive integer/)
  })
})
