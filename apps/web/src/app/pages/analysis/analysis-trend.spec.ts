import { describe, expect, it, vi } from 'vitest'

import { buildAnalysisTrend, trendPeriodLabel } from './analysis-trend'

describe('analysis trend periods', () => {
  it('groups sparse multi-year history into calendar months and preserves zero periods', () => {
    const trend = buildAnalysisTrend([
      { date: '2023-03-28', count: 1 },
      { date: '2026-09-01', count: 2 },
      { date: '2026-09-15', count: 3 },
    ])
    expect(trend.granularity).toBe('month')
    expect(trend.buckets).toHaveLength(43)
    expect(trend.buckets[1]).toEqual({
      from: '2023-04-01',
      to: '2023-04-30',
      count: 0,
      critical: 0,
      blocking: 0,
    })
    expect(trend.buckets.at(-1)).toEqual({
      from: '2026-09-01',
      to: '2026-09-15',
      count: 5,
      critical: 0,
      blocking: 0,
    })
    expect(trend.max).toBe(5)
  })

  it('includes empty days and honors both explicit filter boundaries', () => {
    expect(
      buildAnalysisTrend([{ date: '2024-02-29', count: 2 }], '2024-02-28', '2024-03-01').buckets,
    ).toEqual([
      { from: '2024-02-28', to: '2024-02-28', count: 0, critical: 0, blocking: 0 },
      { from: '2024-02-29', to: '2024-02-29', count: 2, critical: 0, blocking: 0 },
      { from: '2024-03-01', to: '2024-03-01', count: 0, critical: 0, blocking: 0 },
    ])
  })

  it('uses Monday weeks and clips clickable periods to the selected range', () => {
    const trend = buildAnalysisTrend(
      [
        { date: '2026-03-29', count: 3 },
        { date: '2026-03-30', count: 2 },
      ],
      '2026-03-01',
      '2026-04-15',
    )
    expect(trend.granularity).toBe('week')
    expect(trend.buckets[0]).toEqual({
      from: '2026-03-01',
      to: '2026-03-01',
      count: 0,
      critical: 0,
      blocking: 0,
    })
    expect(trend.buckets).toContainEqual({
      from: '2026-03-23',
      to: '2026-03-29',
      count: 3,
      critical: 0,
      blocking: 0,
    })
    expect(trend.buckets).toContainEqual({
      from: '2026-03-30',
      to: '2026-04-05',
      count: 2,
      critical: 0,
      blocking: 0,
    })
    expect(trend.buckets.at(-1)?.to).toBe('2026-04-15')
  })

  it('handles empty results and long histories without losing counts', () => {
    expect(buildAnalysisTrend([]).buckets).toEqual([])
    expect(buildAnalysisTrend([], '2026-01-01', '2026-01-03').buckets).toHaveLength(3)
    const trend = buildAnalysisTrend([
      { date: '2000-01-01', count: 2 },
      { date: '2026-01-01', count: 4 },
    ])
    expect(trend.granularity).toBe('year')
    expect(trend.buckets.reduce((sum, item) => sum + item.count, 0)).toBe(6)
  })
})

describe('analysis trend breakdown and labels', () => {
  it('preserves Critical and Blocking counts while regrouping and clipping periods', () => {
    const trend = buildAnalysisTrend(
      [
        { date: '2026-01-01', count: 3, critical: 1, blocking: 1 },
        { date: '2026-01-15', count: 7, critical: 2, blocking: 3 },
        { date: '2026-01-20', count: 4, critical: 1, blocking: 2 },
        { date: '2026-02-01', count: 5, critical: 0, blocking: 2 },
      ],
      '2026-01-10',
      '2026-02-14',
      'month',
    )
    expect(trend.buckets).toEqual([
      { from: '2026-01-10', to: '2026-01-31', count: 11, critical: 3, blocking: 5 },
      { from: '2026-02-01', to: '2026-02-14', count: 5, critical: 0, blocking: 2 },
    ])
    expect(trend.max).toBe(11)
  })

  it('reuses the active locale formatter for dates and ranges and refreshes on language changes', () => {
    const day = { from: '2024-02-29', to: '2024-02-29' }
    const range = { from: '2024-02-29', to: '2024-03-04' }
    const options = { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' } as const
    const english = new Intl.DateTimeFormat('en-GB', options)
    const french = new Intl.DateTimeFormat('fr-CA', options)
    const start = new Date('2024-02-29T00:00:00Z')
    const end = new Date('2024-03-04T00:00:00Z')
    const DateTimeFormat = Intl.DateTimeFormat
    const constructor = vi
      .spyOn(Intl, 'DateTimeFormat')
      // Constructor spies must return a real Intl instance, unlike ordinary void callbacks.
      // oxlint-disable-next-line typescript/strict-void-return
      .mockImplementation(function (locale, formatOptions): Intl.DateTimeFormat {
        return new DateTimeFormat(locale, formatOptions)
      })
    try {
      expect(trendPeriodLabel(day, 'en-GB')).toBe(english.format(start))
      expect(trendPeriodLabel(range, 'en-GB')).toBe(english.formatRange(start, end))
      expect(trendPeriodLabel(range, 'en-GB')).toBe(english.formatRange(start, end))
      expect(constructor).toHaveBeenCalledTimes(1)

      expect(trendPeriodLabel(range, 'fr-CA')).toBe(french.formatRange(start, end))
      expect(trendPeriodLabel(day, 'fr-CA')).toBe(french.format(start))
      expect(constructor).toHaveBeenCalledTimes(2)

      expect(trendPeriodLabel(day, 'en-GB')).toBe(english.format(start))
      expect(constructor).toHaveBeenCalledTimes(3)
    } finally {
      constructor.mockRestore()
    }
  })

  it('keeps localized date labels stable across time zones', () => {
    expect(trendPeriodLabel({ from: '2024-02-29', to: '2024-02-29' }, 'en')).toBe('Feb 29, 2024')
    expect(trendPeriodLabel({ from: '2024-02-29', to: '2024-02-29' }, 'fr')).toBe('29 févr. 2024')
  })
})
