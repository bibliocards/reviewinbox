export const usageEventTypes = [
  'review_imported',
  'managed_ai_reply_draft_generated',
  'published_reply_created',
  'weekly_digest_generated',
] as const

export type UsageEventType = (typeof usageEventTypes)[number]

export type UsageEvent = {
  organizationId: string
  type: UsageEventType
  quantity: number
  occurredAt: Date
}

export function createUsageEvent(input: UsageEvent): UsageEvent {
  if (input.quantity < 1 || !Number.isInteger(input.quantity)) {
    throw new Error('Usage event quantity must be a positive integer.')
  }

  return input
}
