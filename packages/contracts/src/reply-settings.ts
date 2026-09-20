import { z } from 'zod'

export const maxReplyContextLength = 4000
export const maxLanguageTagLength = 35
export const maxMappedLanguages = 50

const languageTagSchema = z.string().trim().min(1).max(maxLanguageTagLength)

export const updateReplySettingsRequestSchema = z
  .object({
    replyContext: z.string().trim().max(maxReplyContextLength),
    defaultLanguage: languageTagSchema,
    mappedLanguages: z.array(languageTagSchema).max(maxMappedLanguages),
  })
  .strict()
export type UpdateReplySettingsRequest = z.infer<typeof updateReplySettingsRequestSchema>

export const replySettingsResponseSchema = updateReplySettingsRequestSchema.extend({
  appId: z.uuid(),
  updatedAt: z.iso.datetime(),
})
export type ReplySettingsResponse = z.infer<typeof replySettingsResponseSchema>
