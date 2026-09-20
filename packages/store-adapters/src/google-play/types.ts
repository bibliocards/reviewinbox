import { z } from 'zod'

import type { ReviewSyncCheckpoint, StoreCredentialVerificationResult } from '../index'

export type GooglePlayServiceAccountCredential = { client_email: string; private_key: string }

export type GooglePlayReviewSyncRequest = {
  packageName: string
  credential: GooglePlayServiceAccountCredential
  checkpoint: ReviewSyncCheckpoint | null
  maxPages?: number
  pageLimit?: number
  timeoutMs?: number
}

export type GooglePlayReplyPublishRequest = {
  packageName: string
  externalReviewId: string
  replyText: string
  credential: GooglePlayServiceAccountCredential
  timeoutMs?: number
}

export type GooglePlayStoreAdapterErrorCode =
  | 'google_auth_failed'
  | 'google_forbidden'
  | 'google_not_found'
  | 'google_rate_limited'
  | 'google_unavailable'
  | 'google_invalid_response'

export type GooglePlayCredentialVerificationResult =
  StoreCredentialVerificationResult<GooglePlayStoreAdapterErrorCode>

const googleTimestampSchema = z
  .object({ seconds: z.union([z.string(), z.number()]).optional(), nanos: z.number().optional() })
  .loose()

const googlePlayReviewResourceSchema = z
  .object({
    reviewId: z.string().optional(),
    authorName: z.string().optional(),
    comments: z
      .array(
        z
          .object({
            userComment: z
              .object({
                text: z.string().optional(),
                lastModified: googleTimestampSchema.optional(),
                starRating: z.number().optional(),
                reviewerLanguage: z.string().optional(),
                appVersionName: z.string().optional(),
                appVersionCode: z.number().optional(),
              })
              .loose()
              .optional(),
          })
          .loose(),
      )
      .optional(),
  })
  .loose()

export const googlePlayReviewsResponseSchema = z.object({
  reviews: z.array(googlePlayReviewResourceSchema).optional(),
  tokenPagination: z.object({ nextPageToken: z.string().optional() }).optional(),
})

export const googlePlayReplyPublishResponseSchema = z.object({
  result: z
    .object({ replyText: z.string().optional(), lastEdited: googleTimestampSchema.optional() })
    .optional(),
})

export type GooglePlayReviewsResponse = z.infer<typeof googlePlayReviewsResponseSchema>

export type GooglePlayReplyPublishResponse = z.infer<typeof googlePlayReplyPublishResponseSchema>

export type GooglePlayReviewResource = z.infer<typeof googlePlayReviewResourceSchema>

export type GoogleTimestamp = z.infer<typeof googleTimestampSchema>
