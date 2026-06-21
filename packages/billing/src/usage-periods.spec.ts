import { describe, expect, it } from 'vitest'

import { getMonthlyUsagePeriod, isWithinUsagePeriod } from './usage-periods'

describe('getMonthlyUsagePeriod', () => {
  it('returns UTC calendar month boundaries', () => {
    const period = getMonthlyUsagePeriod(new Date('2026-06-21T12:00:00.000Z'))

    expect(period.key).toBe('2026-06')
    expect(period.startsAt.toISOString()).toBe('2026-06-01T00:00:00.000Z')
    expect(period.endsAt.toISOString()).toBe('2026-07-01T00:00:00.000Z')
  })
})

describe('isWithinUsagePeriod', () => {
  it('uses an inclusive start and exclusive end', () => {
    const period = getMonthlyUsagePeriod(new Date('2026-06-21T12:00:00.000Z'))

    expect(isWithinUsagePeriod(new Date('2026-06-01T00:00:00.000Z'), period)).toBe(true)
    expect(isWithinUsagePeriod(new Date('2026-06-30T23:59:59.999Z'), period)).toBe(true)
    expect(isWithinUsagePeriod(new Date('2026-07-01T00:00:00.000Z'), period)).toBe(false)
  })
})
