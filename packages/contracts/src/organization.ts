import { z } from 'zod'

export const billingPlanNameSchema = z.enum(['free', 'starter', 'pro', 'business'])
export type BillingPlanName = z.infer<typeof billingPlanNameSchema>

export const organizationProfileResponseSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  logo: z.url().nullable(),
  role: z.string(),
  canDelete: z.boolean(),
  deletionAvailable: z.boolean(),
})
export type OrganizationProfileResponse = z.infer<typeof organizationProfileResponseSchema>

export const updateOrganizationProfileRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
  })
  .strict()
export type UpdateOrganizationProfileRequest = z.infer<typeof updateOrganizationProfileRequestSchema>

export const deleteOrganizationResponseSchema = z.object({
  nextOrganizationId: z.string().nullable(),
})
export type DeleteOrganizationResponse = z.infer<typeof deleteOrganizationResponseSchema>

export const deleteOrganizationRequestSchema = z
  .object({
    name: z.string().min(1),
  })
  .strict()
export type DeleteOrganizationRequest = z.infer<typeof deleteOrganizationRequestSchema>

export const organizationUsageSeveritySchema = z.enum(['ok', 'warning', 'danger'])
export type OrganizationUsageSeverity = z.infer<typeof organizationUsageSeveritySchema>

export const organizationUsageItemSchema = z.object({
  used: z.number().int().min(0),
  included: z.number().int().min(0),
  limit: z.number().int().min(0).nullable(),
  percent: z.number().int().min(0).max(100).nullable(),
  severity: organizationUsageSeveritySchema.nullable(),
})
export type OrganizationUsageItem = z.infer<typeof organizationUsageItemSchema>

export const organizationUsageResponseSchema = z.object({
  deploymentMode: z.enum(['self-hosted', 'cloud']),
  planName: billingPlanNameSchema,
  limitsEnforced: z.boolean(),
  usagePeriod: z.object({
    key: z.string().min(1),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
  }),
  usage: z.object({
    members: organizationUsageItemSchema,
    apps: organizationUsageItemSchema,
    storeConnections: organizationUsageItemSchema,
    monthlyReviewImports: organizationUsageItemSchema,
    monthlyManagedAiReplyDrafts: organizationUsageItemSchema,
  }),
})
export type OrganizationUsageResponse = z.infer<typeof organizationUsageResponseSchema>
