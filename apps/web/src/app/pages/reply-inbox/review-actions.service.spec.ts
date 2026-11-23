// oxlint-disable-next-line import/no-unassigned-import -- Angular providers need the JIT compiler in Node tests.
import '@angular/compiler'
import { Injector, runInInjectionContext } from '@angular/core'
import { TranslocoService } from '@jsverse/transloco'
import { DialogService } from 'primeng/dynamicdialog'
import { of } from 'rxjs'
import { describe, expect, it, vi } from 'vitest'

import type { ReplyInboxReview } from '../../../../../../packages/contracts/src/reply-inbox'
import { storeReplyCharacterLimits } from '../../../../../../packages/contracts/src/store'
import { AnalysisService } from '../../shared/services/analysis.service'
import { ReplyInboxService } from '../../shared/services/reply-inbox.service'
import { ReviewActionsService } from './review-actions.service'

const review: ReplyInboxReview = {
  id: '00000000-0000-4000-8000-000000000001',
  appId: '00000000-0000-4000-8000-000000000002',
  appName: 'App',
  storeConnectionId: '00000000-0000-4000-8000-000000000003',
  provider: 'google_play',
  externalReviewId: 'store-review',
  authorDisplayName: null,
  rating: 2,
  title: null,
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

function setup() {
  const publishReply = vi.fn<ReplyInboxService['publishReply']>(() => of({ review }))
  const injector = Injector.create({
    providers: [
      { provide: ReplyInboxService, useValue: { publishReply } },
      { provide: AnalysisService, useValue: {} },
      { provide: DialogService, useValue: {} },
      { provide: TranslocoService, useValue: {} },
    ],
  })
  const actions = runInInjectionContext(injector, () => new ReviewActionsService())
  return { actions, publishReply }
}

describe('inline Reply Draft publication', () => {
  it('allows saving but not publishing over the store limit, and publishes trimmed text at the limit', () => {
    const { actions, publishReply } = setup()
    const textAtLimit = 'a'.repeat(storeReplyCharacterLimits.google_play)

    actions.editDraft(review, `${textAtLimit}!`)
    expect(actions.canSaveDraft(review)).toBe(true)
    expect(actions.canPublishDraft(review)).toBe(false)
    actions.publish(review)
    expect(publishReply).not.toHaveBeenCalled()

    actions.editDraft(review, `  ${textAtLimit}\n`)
    expect(actions.canPublishDraft(review)).toBe(true)
    actions.publish(review)
    expect(publishReply).toHaveBeenCalledExactlyOnceWith(review.id, {
      draftText: textAtLimit,
      reviewContentToken: review.reviewContentToken,
    })
  })

  it('disables publication and makes no request when a Review changes after editing', () => {
    const { actions, publishReply } = setup()
    actions.editDraft(review, 'Thanks for the report.')
    const refreshed = { ...review, reviewContentToken: 'b'.repeat(64) }

    expect(actions.canPublishDraft(refreshed)).toBe(false)
    actions.publish(refreshed)
    expect(publishReply).not.toHaveBeenCalled()
  })
})
