export type AutoSyncSchedule = {
  windowStartsAt: Date
  connectionIndex: number
  connectionCount: number
  spreadWindowMinutes: number
}

/**
 * Compute the actual start time for a job while keeping the fixed window as
 * its singleton and cadence anchor.
 */
export function getAutoSyncJobStartsAt(schedule: AutoSyncSchedule): Date {
  if (schedule.connectionCount <= 1) {
    return schedule.windowStartsAt
  }

  const spreadMs = schedule.spreadWindowMinutes * 60 * 1000
  const delayMs = Math.floor((spreadMs * schedule.connectionIndex) / schedule.connectionCount)
  return new Date(schedule.windowStartsAt.getTime() + delayMs)
}

export function isAutoSyncDueAt(input: {
  windowStartsAt: Date
  scheduledStartsAt: Date
  intervalMs: number
  lastAutomaticWindowStartsAt: Date | null
  lastNonAutomaticRunAt: Date | null
}): boolean {
  // Automatic runs are compared by their fixed UTC windows. This is stable
  // when a queue starts a job a little late or the spread changes because the
  // number of active connections changes.
  if (
    input.lastAutomaticWindowStartsAt &&
    input.windowStartsAt.getTime() - input.lastAutomaticWindowStartsAt.getTime() < input.intervalMs
  ) {
    return false
  }

  // Manual and initial imports do not have a logical automatic window. Keep
  // their existing cooldown based on the actual scheduled start instead.
  if (input.lastNonAutomaticRunAt && input.scheduledStartsAt.getTime() - input.lastNonAutomaticRunAt.getTime() < input.intervalMs) {
    return false
  }

  return true
}
