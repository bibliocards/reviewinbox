import { z } from 'zod'

export const replyDraftOutputSchema = z.object({
  draftText: z.string().trim().min(1),
  detectedReviewLanguage: z.string().trim().min(1).max(35).nullable(),
})

export type ReplyDraftModelOutput = z.infer<typeof replyDraftOutputSchema>

export function parseReplyDraftOutput(output: unknown, maxDraftTextLength: number): ReplyDraftModelOutput {
  const parsed = replyDraftOutputSchema.parse(output)

  if (parsed.draftText.length > maxDraftTextLength) {
    throw new z.ZodError([
      {
        code: 'too_big',
        maximum: maxDraftTextLength,
        origin: 'string',
        inclusive: true,
        path: ['draftText'],
        message: `Too big: expected string to have <=${maxDraftTextLength} characters`,
      },
    ])
  }

  return parsed
}
