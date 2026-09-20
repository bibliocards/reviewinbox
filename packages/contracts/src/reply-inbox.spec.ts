import { describe, expect, it } from 'vitest'

import {
  publishReplyRequestSchema,
  saveReplyDraftRequestSchema,
  updateReviewIgnoredStatusRequestSchema,
} from './reply-inbox'

const reviewContentToken = 'a'.repeat(64)

describe('Reply Inbox content token requests', () => {
  it('requires the token when saving a Reply Draft', () => {
    expect(
      saveReplyDraftRequestSchema.safeParse({ draftText: 'Thanks', reviewContentToken }).success,
    ).toBe(true)
    expect(saveReplyDraftRequestSchema.safeParse({ draftText: 'Thanks' }).success).toBe(false)
  })

  it('requires the token for both identity-based and inline publication', () => {
    expect(publishReplyRequestSchema.safeParse({ reviewContentToken }).success).toBe(true)
    expect(
      publishReplyRequestSchema.safeParse({ draftText: 'Thanks', reviewContentToken }).success,
    ).toBe(true)
    expect(publishReplyRequestSchema.safeParse({}).success).toBe(false)
  })

  it('requires a valid token when ignoring or unignoring a Review', () => {
    expect(updateReviewIgnoredStatusRequestSchema.safeParse({ reviewContentToken }).success).toBe(
      true,
    )
    expect(updateReviewIgnoredStatusRequestSchema.safeParse({}).success).toBe(false)
    expect(
      updateReviewIgnoredStatusRequestSchema.safeParse({ reviewContentToken: 'stale' }).success,
    ).toBe(false)
  })
})
