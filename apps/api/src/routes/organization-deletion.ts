const organizationDeletionBlockingSubscriptionStatuses = ['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete'] as const

export function isSubscriptionBlockingOrganizationDeletion(status: string): boolean {
  return organizationDeletionBlockingSubscriptionStatuses.includes(
    status as (typeof organizationDeletionBlockingSubscriptionStatuses)[number],
  )
}

export function organizationDeletionBlockingStatuses(): string[] {
  return [...organizationDeletionBlockingSubscriptionStatuses]
}
