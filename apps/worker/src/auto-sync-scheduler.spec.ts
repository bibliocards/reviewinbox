import { describe, expect, it } from 'vitest'

import { getAutoSyncJobStartsAt, isAutoSyncDueAt } from './auto-sync-scheduler'

describe('automatic sync scheduling', () => {
  it('uses the fixed window after a spread run starts with one-second jitter', () => {
    const firstWindowStartsAt = new Date('2026-09-20T00:00:00.000Z')
    const nextWindowStartsAt = new Date('2026-09-20T06:00:00.000Z')
    const nextJobStartsAt = getAutoSyncJobStartsAt({
      windowStartsAt: nextWindowStartsAt,
      connectionIndex: 1,
      connectionCount: 2,
      spreadWindowMinutes: 60,
    })

    expect(nextJobStartsAt.toISOString()).toBe('2026-09-20T06:30:00.000Z')
    expect(
      isAutoSyncDueAt({
        windowStartsAt: nextWindowStartsAt,
        scheduledStartsAt: nextJobStartsAt,
        intervalMs: 6 * 60 * 60 * 1000,
        lastAutomaticWindowStartsAt: firstWindowStartsAt,
        lastNonAutomaticRunAt: null,
      }),
    ).toBe(true)
  })

  it('handles a changed spread without changing automatic cadence', () => {
    expect(
      isAutoSyncDueAt({
        windowStartsAt: new Date('2026-09-20T06:00:00.000Z'),
        scheduledStartsAt: new Date('2026-09-20T06:10:00.000Z'),
        intervalMs: 6 * 60 * 60 * 1000,
        lastAutomaticWindowStartsAt: new Date('2026-09-20T00:00:00.000Z'),
        lastNonAutomaticRunAt: null,
      }),
    ).toBe(true)
  })

  it('keeps a manual or initial run from being followed too soon', () => {
    expect(
      isAutoSyncDueAt({
        windowStartsAt: new Date('2026-09-20T06:00:00.000Z'),
        scheduledStartsAt: new Date('2026-09-20T06:30:00.000Z'),
        intervalMs: 6 * 60 * 60 * 1000,
        lastAutomaticWindowStartsAt: null,
        lastNonAutomaticRunAt: new Date('2026-09-20T05:00:00.000Z'),
      }),
    ).toBe(false)
  })

  it('preserves the free plan cadence across a spread boundary', () => {
    const nextJobStartsAt = getAutoSyncJobStartsAt({
      windowStartsAt: new Date('2026-09-21T00:00:00.000Z'),
      connectionIndex: 1,
      connectionCount: 2,
      spreadWindowMinutes: 60,
    })

    expect(nextJobStartsAt.toISOString()).toBe('2026-09-21T00:30:00.000Z')
    expect(
      isAutoSyncDueAt({
        windowStartsAt: new Date('2026-09-21T00:00:00.000Z'),
        scheduledStartsAt: nextJobStartsAt,
        intervalMs: 24 * 60 * 60 * 1000,
        lastAutomaticWindowStartsAt: new Date('2026-09-20T00:00:00.000Z'),
        lastNonAutomaticRunAt: null,
      }),
    ).toBe(true)
  })
})
