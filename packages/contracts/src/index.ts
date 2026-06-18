import { z } from "zod"

export const healthResponseSchema = z.object({
  ok: z.literal(true),
  service: z.literal("api"),
  checkedAt: z.iso.datetime(),
})

export type HealthResponse = z.infer<typeof healthResponseSchema>

export const storeProviderSchema = z.enum(["apple_app_store", "google_play"])
export type StoreProvider = z.infer<typeof storeProviderSchema>

export const storeConnectionStatusSchema = z.enum(["active", "disabled"])
export type StoreConnectionStatus = z.infer<typeof storeConnectionStatusSchema>

export const replyStatusSchema = z.enum(["pending", "drafted", "published", "ignored", "failed"])
export type ReplyStatus = z.infer<typeof replyStatusSchema>

export const syncRunStatusSchema = z.enum(["pending", "running", "succeeded", "failed"])
export type SyncRunStatus = z.infer<typeof syncRunStatusSchema>

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
