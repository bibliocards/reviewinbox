import { describe, expect, it } from 'vitest'

import type { ReplyInboxReview } from '../../../../../../packages/contracts/src/reply-inbox'
import { storeReplyCharacterLimits } from '../../../../../../packages/contracts/src/store'
import { buildPublishRequest, replyCharactersOverLimit } from './reply-draft-edit'

const review: ReplyInboxReview = {
  id: '00000000-0000-4000-8000-000000000001',
  appId: '00000000-0000-4000-8000-000000000002',
  appName: 'App',
  storeConnectionId: '00000000-0000-4000-8000-000000000003',
  provider: 'google_play',
  externalReviewId: 'store-review',
  authorDisplayName: null,
  rating: 2,
  title: 'Sync issue',
  body: 'Sync stopped.',
  language: 'en',
  version: null,
  versionLookupStatus: 'unavailable',
  country: null,
  locale: null,
  reviewedAt: '2026-10-13T08:00:00.000Z',
  replyStatus: 'drafted',
  reviewContentToken: 'a'.repeat(64),
  changedAfterReply: false,
  replyBaseline: null,
  draftFailureCode: null,
  draftFailureAt: null,
  replyDraft: {
    id: '00000000-0000-4000-8000-000000000004',
    draftText: 'Please update the App.',
    chosenReplyLanguage: 'en',
    updatedAt: '2026-10-13T09:00:00.000Z',
  },
  publishedReply: null,
  lastPublishFailure: null,
}

describe('Reply Draft length feedback', () => {
  it.each(['google_play', 'apple_app_store'] as const)(
    'reports excess characters using the %s publication limit',
    (provider) => {
      const limit = storeReplyCharacterLimits[provider]
      expect(replyCharactersOverLimit('', provider)).toBe(0)
      expect(replyCharactersOverLimit('a'.repeat(limit - 1), provider)).toBe(0)
      expect(replyCharactersOverLimit('a'.repeat(limit), provider)).toBe(0)
      expect(replyCharactersOverLimit('a'.repeat(limit + 1), provider)).toBe(1)
      expect(replyCharactersOverLimit('a'.repeat(limit + 25), provider)).toBe(25)
    },
  )

  it('ignores surrounding whitespace like the publication request', () => {
    const text = 'a'.repeat(storeReplyCharacterLimits.google_play)
    expect(replyCharactersOverLimit(` \n${text}\n `, 'google_play')).toBe(0)
    expect(replyCharactersOverLimit(` \n${text}b\n `, 'google_play')).toBe(1)
  })

  it('counts UTF-16 code units consistently with the existing character counter', () => {
    const text = 'a'.repeat(storeReplyCharacterLimits.google_play - 1)
    expect(replyCharactersOverLimit(`${text}🎉`, 'google_play')).toBe(1)
  })
})

describe('publishing from the Reply Inbox editor', () => {
  it('publishes an untouched saved draft using its displayed identity and revision', () => {
    expect(buildPublishRequest(review)).toEqual({
      reviewContentToken: 'a'.repeat(64),
      replyDraftId: '00000000-0000-4000-8000-000000000004',
      replyDraftUpdatedAt: '2026-10-13T09:00:00.000Z',
    })
  })

  it('keeps the Review version seen when editing, even after a refreshed Review arrives', () => {
    const refreshedReview = { ...review, reviewContentToken: 'b'.repeat(64) }
    expect(
      buildPublishRequest(refreshedReview, {
        text: '  Your decks are safe.  ',
        reviewContentToken: 'a'.repeat(64),
      }),
    ).toEqual({ draftText: 'Your decks are safe.', reviewContentToken: 'a'.repeat(64) })
  })

  it.each(['pending', 'published', 'ignored', 'failed'] as const)(
    'does not publish a %s Review from the draft editor',
    (replyStatus: ReplyInboxReview['replyStatus']) => {
      expect(buildPublishRequest({ ...review, replyStatus })).toBeNull()
    },
  )

  it('does not publish when the saved draft has disappeared', () => {
    expect(buildPublishRequest({ ...review, replyDraft: null })).toBeNull()
  })
})
