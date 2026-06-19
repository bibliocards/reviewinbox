import { z } from 'zod'

export const healthResponseSchema = z.object({
  ok: z.literal(true),
  service: z.literal('api'),
  checkedAt: z.iso.datetime(),
})

export type HealthResponse = z.infer<typeof healthResponseSchema>
