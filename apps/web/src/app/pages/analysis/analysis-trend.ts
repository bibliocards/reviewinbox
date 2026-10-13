export type TrendPeriod = { from: string; to: string }
type TrendTotals = { count: number; critical: number; blocking: number }
export type TrendBucket = TrendPeriod & TrendTotals
type TrendPoint = { date: string; count: number; critical?: number; blocking?: number }
export type Granularity = 'day' | 'week' | 'month' | 'year'
const dayMs = 86_400_000
const dateString = (date: Date) => date.toISOString().slice(0, 10)
const utcDate = (value: string) => new Date(`${value}T00:00:00Z`)

function periodStart(value: string, granularity: Granularity): Date {
  const date = utcDate(value)
  if (granularity === 'week') {
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
  }
  if (granularity === 'month' || granularity === 'year') {
    date.setUTCDate(1)
  }
  if (granularity === 'year') {
    date.setUTCMonth(0)
  }
  return date
}

function nextPeriod(date: Date, granularity: Granularity): Date {
  const next = new Date(date)
  if (granularity === 'year') {
    next.setUTCFullYear(next.getUTCFullYear() + 1)
  } else if (granularity === 'month') {
    next.setUTCMonth(next.getUTCMonth() + 1)
  } else {
    next.setUTCDate(next.getUTCDate() + (granularity === 'week' ? 7 : 1))
  }
  return next
}

type AnalysisTrend = { granularity: Granularity; buckets: TrendBucket[]; max: number }

function chooseGranularity(start: string, end: string): Granularity {
  const days = (utcDate(end).getTime() - utcDate(start).getTime()) / dayMs + 1
  if (days <= 31) {
    return 'day'
  }
  if (days <= 120) {
    return 'week'
  }
  if (days <= 1461) {
    return 'month'
  }
  return 'year'
}

function sumPeriods(points: readonly TrendPoint[], range: TrendPeriod, granularity: Granularity) {
  const counts = new Map<string, TrendTotals>()
  for (const point of points) {
    if (point.date < range.from || point.date > range.to) {
      continue
    }
    const key = dateString(periodStart(point.date, granularity))
    const current = counts.get(key) ?? { count: 0, critical: 0, blocking: 0 }
    counts.set(key, {
      count: current.count + point.count,
      critical: current.critical + (point.critical ?? 0),
      blocking: current.blocking + (point.blocking ?? 0),
    })
  }
  return counts
}

function fillPeriods(
  range: TrendPeriod,
  granularity: Granularity,
  counts: Map<string, TrendTotals>,
): TrendBucket[] {
  const buckets: TrendBucket[] = []
  for (let cursor = periodStart(range.from, granularity); dateString(cursor) <= range.to;) {
    const next = nextPeriod(cursor, granularity)
    const key = dateString(cursor)
    const last = dateString(new Date(next.getTime() - dayMs))
    buckets.push({
      from: key < range.from ? range.from : key,
      to: last > range.to ? range.to : last,
      ...(counts.get(key) ?? { count: 0, critical: 0, blocking: 0 }),
    })
    cursor = next
  }
  return buckets
}

function trendRange(points: readonly TrendPoint[], from: string, to: string): TrendPeriod {
  const dates = points.map((point) => point.date)
  return {
    from: from || dates.reduce((min, date) => (date < min ? date : min), dates[0] ?? ''),
    to: to || dates.reduce((max, date) => (date > max ? date : max), dates[0] ?? ''),
  }
}

export function buildAnalysisTrend(
  points: readonly TrendPoint[],
  from = '',
  to = '',
  requestedGranularity?: Granularity,
): AnalysisTrend {
  const range = trendRange(points, from, to)
  if (range.from === '' || range.to === '' || range.from > range.to) {
    return { granularity: 'day', buckets: [], max: 1 }
  }
  const granularity = requestedGranularity ?? chooseGranularity(range.from, range.to)
  const buckets = fillPeriods(range, granularity, sumPeriods(points, range, granularity))
  return { granularity, buckets, max: Math.max(1, ...buckets.map((bucket) => bucket.count)) }
}

export function trendPeriodLabel(period: TrendPeriod, locale: string): string {
  const formatter = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
  return period.from === period.to
    ? formatter.format(utcDate(period.from))
    : formatter.formatRange(utcDate(period.from), utcDate(period.to))
}
