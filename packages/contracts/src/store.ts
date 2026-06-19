import { z } from 'zod'

export const storeProviderSchema = z.enum(['apple_app_store', 'google_play'])
export type StoreProvider = z.infer<typeof storeProviderSchema>

export const storeConnectionStatusSchema = z.enum(['active', 'disabled'])
export type StoreConnectionStatus = z.infer<typeof storeConnectionStatusSchema>

export const storeCredentialMetadataSchema = z.object({
  hasCredential: z.boolean(),
  updatedAt: z.iso.datetime().nullable(),
  keyId: z.string().min(1).nullable(),
})
export type StoreCredentialMetadata = z.infer<typeof storeCredentialMetadataSchema>

export const storeConnectionResponseSchema = z.object({
  id: z.uuid(),
  appId: z.uuid(),
  provider: storeProviderSchema,
  status: storeConnectionStatusSchema,
  externalAppId: z.string().nullable(),
  externalStoreId: z.string().nullable(),
  displayName: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  credential: storeCredentialMetadataSchema,
})
export type StoreConnectionResponse = z.infer<typeof storeConnectionResponseSchema>

export const listStoreConnectionsResponseSchema = z.object({
  storeConnections: z.array(storeConnectionResponseSchema),
})
export type ListStoreConnectionsResponse = z.infer<typeof listStoreConnectionsResponseSchema>

export const createStoreConnectionRequestSchema = z
  .object({
    provider: storeProviderSchema,
    status: storeConnectionStatusSchema.optional(),
    externalAppId: z.string().trim().min(1).max(512).nullable().optional(),
    externalStoreId: z.string().trim().min(1).max(512).nullable().optional(),
    displayName: z.string().trim().min(1).max(160).nullable().optional(),
  })
  .strict()
export type CreateStoreConnectionRequest = z.infer<typeof createStoreConnectionRequestSchema>

export const updateStoreConnectionRequestSchema = z
  .object({
    status: storeConnectionStatusSchema.optional(),
    externalAppId: z.string().trim().min(1).max(512).nullable().optional(),
    externalStoreId: z.string().trim().min(1).max(512).nullable().optional(),
    displayName: z.string().trim().min(1).max(160).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one Store Connection field must be provided.',
  })
export type UpdateStoreConnectionRequest = z.infer<typeof updateStoreConnectionRequestSchema>

export const putStoreCredentialRequestSchema = z
  .object({
    plaintext: z
      .string()
      .min(1)
      .max(64 * 1024),
  })
  .strict()
export type PutStoreCredentialRequest = z.infer<typeof putStoreCredentialRequestSchema>

export const storeCredentialResponseSchema = z.object({
  storeConnectionId: z.uuid(),
  credential: storeCredentialMetadataSchema,
})
export type StoreCredentialResponse = z.infer<typeof storeCredentialResponseSchema>

export const replyStatusSchema = z.enum(['pending', 'drafted', 'published', 'ignored', 'failed'])
export type ReplyStatus = z.infer<typeof replyStatusSchema>

export const syncRunStatusSchema = z.enum(['pending', 'running', 'succeeded', 'failed'])
export type SyncRunStatus = z.infer<typeof syncRunStatusSchema>

export const syncRunResponseSchema = z.object({
  id: z.uuid(),
  organizationId: z.string().min(1),
  appId: z.uuid(),
  storeConnectionId: z.uuid(),
  status: syncRunStatusSchema,
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
  fetchedCount: z.number().int().min(0),
  storedCount: z.number().int().min(0),
  errorCode: z.string().min(1).nullable(),
  errorMessage: z.string().min(1).nullable(),
  checkpoint: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type SyncRunResponse = z.infer<typeof syncRunResponseSchema>

export const normalizedReviewSchema = z.object({
  externalReviewId: z.string().min(1),
  authorDisplayName: z.string().min(1).nullable().optional(),
  rating: z.number().int().min(1).max(5),
  title: z.string().nullable().optional(),
  body: z.string(),
  language: z.string().min(1).nullable().optional(),
  version: z.string().min(1).nullable().optional(),
  country: z.string().min(1).nullable().optional(),
  locale: z.string().min(1).nullable().optional(),
  reviewedAt: z.iso.datetime(),
  rawPayload: z.unknown().optional(),
})

export type NormalizedReview = z.infer<typeof normalizedReviewSchema>
