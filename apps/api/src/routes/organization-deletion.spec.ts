import { describe, expect, it } from 'vitest'

import { isSubscriptionBlockingOrganizationDeletion } from './organization-deletion'

describe('Organization deletion billing guard', () => {
  it.each(['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete'])(
    'blocks deletion for a %s subscription',
    (status) => {
      expect(isSubscriptionBlockingOrganizationDeletion(status)).toBe(true)
    },
  )

  it.each(['canceled', 'incomplete_expired'])('allows deletion for a terminal %s subscription', (status) => {
    expect(isSubscriptionBlockingOrganizationDeletion(status)).toBe(false)
  })
})
