import { describe, expect, it } from 'vitest'

import { publishReplyRequestSchema, saveReplyDraftRequestSchema } from './reply-inbox'

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
})
