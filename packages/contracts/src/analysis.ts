import { z } from 'zod'

export const reviewIntentSchema = z.enum([
  'report_problem',
  'request_feature',
  'request_help',
  'request_refund',
  'express_satisfaction',
  'express_dissatisfaction',
])
export type ReviewIntent = z.infer<typeof reviewIntentSchema>
export const reportedSeveritySchema = z.enum(['none', 'minor', 'degraded', 'blocking', 'critical'])
export type ReportedSeverity = z.infer<typeof reportedSeveritySchema>
export const topicValidationStatusSchema = z.enum(['pending', 'approved', 'rejected'])
export const reviewAnalysisStatusSchema = z.enum([
  'pending',
  'processing',
  'completed',
  'failed',
  'skipped',
])
export const analysisProviderSchema = z.enum(['apple_app_store', 'google_play'])
export const reviewTopicSchema = z.object({
  id: z.uuid(),
  appId: z.uuid(),
  label: z.string(),
  description: z.string(),
  aliases: z.array(z.string()),
  status: topicValidationStatusSchema,
  origin: z.enum(['human', 'ai']),
  mergedIntoId: z.uuid().nullable(),
  reviewCount: z.number().int().nonnegative(),
  examples: z.array(z.object({ id: z.uuid(), body: z.string() })),
})
export type ReviewTopic = z.infer<typeof reviewTopicSchema>
export const analysisFiltersSchema = z
  .object({
    appId: z.uuid().optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    provider: analysisProviderSchema.optional(),
    version: z.string().max(200).optional(),
    severity: z.union([reportedSeveritySchema, z.literal('unknown')]).optional(),
    intent: reviewIntentSchema.optional(),
    topicId: z.uuid().optional(),
    topicStatus: z.enum(['pending', 'approved']).optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict()
  .refine((value) => value.version === undefined || value.appId !== undefined, {
    message: 'A version filter requires an App.',
    path: ['version'],
  })
  .refine(
    (value) =>
      value.from === undefined
      || value.to === undefined
      || Date.parse(value.from) <= Date.parse(value.to),
    { message: 'Invalid date interval.', path: ['to'] },
  )
export type AnalysisFilters = z.infer<typeof analysisFiltersSchema>
export const classificationOverrideSchema = z
  .object({
    topicIds: z
      .array(z.uuid())
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length, 'Duplicate topics.'),
    intents: z
      .array(reviewIntentSchema)
      .max(6)
      .refine((intents) => new Set(intents).size === intents.length, 'Duplicate intents.'),
    severity: reportedSeveritySchema.nullable(),
  })
  .strict()
export type ClassificationOverride = z.infer<typeof classificationOverrideSchema>
export const analysisReviewSchema = z.object({
  id: z.uuid(),
  appId: z.uuid(),
  appName: z.string(),
  provider: analysisProviderSchema,
  title: z.string().nullable(),
  body: z.string(),
  rating: z.number(),
  version: z.string().nullable(),
  versionLookupStatus: z.enum(['pending', 'resolved', 'unavailable']),
  reviewedAt: z.iso.datetime(),
  status: reviewAnalysisStatusSchema,
  severity: reportedSeveritySchema.nullable(),
  intents: z.array(reviewIntentSchema),
  topics: z.array(reviewTopicSchema),
  hasOverride: z.boolean(),
  needsRecheck: z.boolean(),
  uncovered: z.boolean(),
  analyzedAt: z.iso.datetime().nullable(),
})
export type AnalysisReview = z.infer<typeof analysisReviewSchema>
export const analysisResponseSchema = z.object({
  enabled: z.boolean(),
  discoveryEnabled: z.boolean(),
  canManage: z.boolean(),
  total: z.number().int().nonnegative(),
  analyzed: z.number().int().nonnegative(),
  page: z.number(),
  pageSize: z.number(),
  severities: z.array(
    z.object({
      severity: z.union([reportedSeveritySchema, z.literal('unknown')]),
      count: z.number(),
    }),
  ),
  topics: z.array(reviewTopicSchema),
  trend: z.array(
    z.object({ date: z.string(), count: z.number(), critical: z.number(), blocking: z.number() }),
  ),
  versions: z.array(z.object({ provider: analysisProviderSchema, version: z.string() })),
  reviews: z.array(analysisReviewSchema),
})
export type AnalysisResponse = z.infer<typeof analysisResponseSchema>
export const topicListResponseSchema = z.object({
  topics: z.array(reviewTopicSchema),
  canManage: z.boolean(),
  discoveryEnabled: z.boolean(),
})
export type TopicListResponse = z.infer<typeof topicListResponseSchema>
export const saveTopicRequestSchema = z
  .object({
    label: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(2000),
    status: topicValidationStatusSchema.optional(),
  })
  .strict()
export const updateTopicRequestSchema = saveTopicRequestSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0)
export const mergeTopicRequestSchema = z.object({ targetTopicId: z.uuid() }).strict()
