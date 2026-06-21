export type UsagePeriod = {
  key: string
  startsAt: Date
  endsAt: Date
}

export function getMonthlyUsagePeriod(now = new Date()): UsagePeriod {
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const startsAt = new Date(Date.UTC(year, month, 1))
  const endsAt = new Date(Date.UTC(year, month + 1, 1))

  return {
    key: `${year}-${String(month + 1).padStart(2, '0')}`,
    startsAt,
    endsAt,
  }
}

export function isWithinUsagePeriod(date: Date, period: UsagePeriod): boolean {
  const time = date.getTime()

  return time >= period.startsAt.getTime() && time < period.endsAt.getTime()
}
