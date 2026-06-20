import type { GenerateReplyDraftInput } from './reply-draft'

const replyDraftLimits = {
  apple_app_store: { maxCharacters: 4000, maxOutputTokens: 1000 },
  google_play: { maxCharacters: 350, maxOutputTokens: 140 },
} satisfies Record<GenerateReplyDraftInput['store'], { maxCharacters: number; maxOutputTokens: number }>

export function getStoreReplyDraftLimit(store: GenerateReplyDraftInput['store']): { maxCharacters: number; maxOutputTokens: number } {
  return replyDraftLimits[store]
}
