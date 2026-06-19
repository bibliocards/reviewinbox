import { z } from 'zod'

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
