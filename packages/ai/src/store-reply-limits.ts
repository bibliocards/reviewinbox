import { storeReplyCharacterLimits } from '@reviewinbox/contracts'

import type { GenerateReplyDraftInput } from './reply-draft'

const replyDraftTokenBudgets: Record<GenerateReplyDraftInput['store'], number> = {
  apple_app_store: 1000,
  google_play: 140,
}

export function getStoreReplyDraftLimit(store: GenerateReplyDraftInput['store']) {
  return {
    maxCharacters: storeReplyCharacterLimits[store],
    maxOutputTokens: replyDraftTokenBudgets[store],
  }
}
