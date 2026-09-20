const organizationDeletionBlockingSubscriptionStatuses = [
  'active',
  'trialing',
  'past_due',
  'unpaid',
  'paused',
  'incomplete',
] as const

export function isSubscriptionBlockingOrganizationDeletion(status: string): boolean {
  return organizationDeletionBlockingSubscriptionStatuses.some((candidate) => candidate === status)
}

export function organizationDeletionBlockingStatuses(): string[] {
  return [...organizationDeletionBlockingSubscriptionStatuses]
}
