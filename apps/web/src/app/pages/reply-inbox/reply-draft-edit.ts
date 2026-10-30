import type { PublishReplyRequest, ReplyInboxReview } from '@reviewinbox/contracts'
import { storeReplyCharacterLimits } from '@reviewinbox/contracts'

export type ReplyDraftEdit = { text: string; reviewContentToken: string }

export function replyCharactersOverLimit(
  text: string,
  provider: ReplyInboxReview['provider'],
): number {
  return Math.max(0, text.trim().length - storeReplyCharacterLimits[provider])
}

export function buildPublishRequest(
  review: ReplyInboxReview,
  edit?: ReplyDraftEdit,
): PublishReplyRequest | null {
  if (review.replyStatus !== 'drafted' || review.replyDraft === null) {
    return null
  }
  if (edit !== undefined) {
    return { draftText: edit.text.trim(), reviewContentToken: edit.reviewContentToken }
  }
  return {
    reviewContentToken: review.reviewContentToken,
    replyDraftId: review.replyDraft.id,
    replyDraftUpdatedAt: review.replyDraft.updatedAt,
  }
}
