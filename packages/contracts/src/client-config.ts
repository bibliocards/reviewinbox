import { z } from 'zod'

export const deploymentModeSchema = z.enum(['self-hosted', 'cloud'])

export const clientConfigResponseSchema = z.object({
  deploymentMode: deploymentModeSchema,
  auth: z.object({
    emailPassword: z.boolean(),
    google: z.boolean(),
    enterpriseSso: z.boolean(),
    signUpAvailable: z.boolean(),
  }),
})

export type ClientConfigResponse = z.infer<typeof clientConfigResponseSchema>
