import { z } from 'zod'

export const deploymentModeSchema = z.enum(['self-hosted', 'cloud'])

export const clientConfigResponseSchema = z.object({
  deploymentMode: deploymentModeSchema,
  appPublicUrl: z.url(),
  auth: z.object({
    emailPassword: z.boolean(),
    google: z.boolean(),
    enterpriseSso: z.boolean(),
    signUpAvailable: z.boolean(),
  }),
  mail: z.object({
    invitationEmailEnabled: z.boolean(),
  }),
})

export type ClientConfigResponse = z.infer<typeof clientConfigResponseSchema>

export const invitationDetailsResponseSchema = z.object({
  id: z.string(),
  email: z.email(),
  organizationName: z.string(),
})

export type InvitationDetailsResponse = z.infer<typeof invitationDetailsResponseSchema>
