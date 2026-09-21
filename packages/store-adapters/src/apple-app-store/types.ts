import { z } from 'zod'

import type { ReviewSyncCheckpoint, StoreCredentialVerificationResult } from '../index'

export type AppleAppStoreCredential = { issuerId: string; keyId: string; privateKey: string }

export type AppleReviewSyncRequest = {
  appStoreAppId: string
  credential: AppleAppStoreCredential
  checkpoint: ReviewSyncCheckpoint | null
  maxPages?: number
  pageLimit?: number
  timeoutMs?: number
}

export type AppleReplyPublishRequest = {
  appStoreAppId: string
  externalReviewId: string
  replyText: string
  credential: AppleAppStoreCredential
  timeoutMs?: number
}

export type AppleStoreAdapterErrorCode =
  | 'apple_auth_failed'
  | 'apple_forbidden'
  | 'apple_not_found'
  | 'apple_rate_limited'
  | 'apple_unavailable'
  | 'apple_invalid_response'

export type AppleCredentialVerificationResult =
  StoreCredentialVerificationResult<AppleStoreAdapterErrorCode>

const appleCustomerReviewAttributesSchema = z
  .object({
    body: z.string().optional(),
    createdDate: z.string().optional(),
    rating: z.number().optional(),
    reviewerNickname: z.string().optional(),
    territory: z.string().optional(),
    title: z.string().optional(),
  })
  .loose()

const appleCustomerReviewResourceSchema = z
  .object({ id: z.string(), attributes: appleCustomerReviewAttributesSchema.optional() })
  .loose()

export const appleCustomerReviewsResponseSchema = z.object({
  data: z.array(appleCustomerReviewResourceSchema),
  links: z.object({ next: z.string().optional() }).optional(),
})

export const appleCustomerReviewResponseSchema = z.object({
  data: z.object({ id: z.string().optional() }),
})

export type AppleCustomerReviewsResponse = z.infer<typeof appleCustomerReviewsResponseSchema>

export type AppleCustomerReviewAttributes = z.infer<typeof appleCustomerReviewAttributesSchema>

export type AppleCustomerReviewResource = z.infer<typeof appleCustomerReviewResourceSchema>

export type AppleCustomerReviewResponseResource = { id?: string }
