import { z } from 'zod'
import { replyStatusSchema } from './store'

export const replyInboxFilterSchema = z.enum(['actionable', 'pending', 'drafted', 'failed', 'ignored', 'published'])
export const replyAuditActionSchema = z.enum(['draft_created', 'draft_edited', 'ignored', 'unignored', 'publish_failed', 'published'])

export const replyInboxReviewSchema = z.object({
  id: z.uuid(),
  appId: z.uuid(),
  appName: z.string(),
  storeConnectionId: z.uuid(),
  provider: z.enum(['apple_app_store', 'google_play']),
  externalReviewId: z.string(),
  authorDisplayName: z.string().nullable(),
  rating: z.number().int().min(1).max(5),
  title: z.string().nullable(),
  body: z.string(),
  language: z.string().nullable(),
  version: z.string().nullable(),
  country: z.string().nullable(),
  locale: z.string().nullable(),
  reviewedAt: z.iso.datetime(),
  replyStatus: replyStatusSchema,
  draftFailureCode: z.string().nullable(),
  draftFailureAt: z.iso.datetime().nullable(),
  replyDraft: z
    .object({
      id: z.uuid(),
      draftText: z.string(),
      chosenReplyLanguage: z.string(),
      updatedAt: z.iso.datetime(),
    })
    .nullable(),
  publishedReply: z
    .object({
      id: z.uuid(),
      externalReplyId: z.string().nullable(),
      replyText: z.string(),
      publishedAt: z.iso.datetime(),
    })
    .nullable(),
  lastPublishFailure: z
    .object({
      createdAt: z.iso.datetime(),
      errorCode: z.string().nullable(),
      errorMessage: z.string().nullable(),
    })
    .nullable(),
})
export type ReplyInboxReview = z.infer<typeof replyInboxReviewSchema>

export const listReplyInboxResponseSchema = z.object({
  reviews: z.array(replyInboxReviewSchema),
})
export type ListReplyInboxResponse = z.infer<typeof listReplyInboxResponseSchema>

export const replyAuditEventResponseSchema = z.object({
  id: z.uuid(),
  reviewId: z.uuid(),
  actorUserId: z.string(),
  action: replyAuditActionSchema,
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.iso.datetime(),
})
export type ReplyAuditEventResponse = z.infer<typeof replyAuditEventResponseSchema>

export const replyAuditEventsResponseSchema = z.object({
  events: z.array(replyAuditEventResponseSchema),
})
export type ReplyAuditEventsResponse = z.infer<typeof replyAuditEventsResponseSchema>

export const saveReplyDraftRequestSchema = z
  .object({
    draftText: z.string().trim().min(1).max(4000),
  })
  .strict()
export type SaveReplyDraftRequest = z.infer<typeof saveReplyDraftRequestSchema>

export const publishReplyRequestSchema = z
  .object({
    replyDraftId: z.uuid().optional(),
    replyDraftUpdatedAt: z.iso.datetime().optional(),
    draftText: z.string().trim().min(1).max(4000).optional(),
  })
  .strict()
export type PublishReplyRequest = z.infer<typeof publishReplyRequestSchema>

export const queueReplyDraftResponseSchema = z.object({
  queued: z.boolean(),
})
export type QueueReplyDraftResponse = z.infer<typeof queueReplyDraftResponseSchema>

export const replyActionResponseSchema = z.object({
  review: replyInboxReviewSchema,
})
export type ReplyActionResponse = z.infer<typeof replyActionResponseSchema>
