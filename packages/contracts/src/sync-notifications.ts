import { z } from 'zod'

export const syncWebhookKindSchema = z.enum(['slack', 'discord', 'json'])
export const syncWebhookInputSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('slack'), url: z.url().max(2048) }),
  z.strictObject({ kind: z.literal('discord'), url: z.url().max(2048) }),
  z.strictObject({
    kind: z.literal('json'),
    url: z.url().max(2048),
    signingSecret: z.string().min(32).max(256),
  }),
])
export type SyncWebhookInput = z.infer<typeof syncWebhookInputSchema>

export const syncWebhookSettingsSchema = z.object({
  destination: z
    .object({
      kind: syncWebhookKindSchema,
      lastDeliveryAt: z.iso.datetime().nullable(),
      lastDeliveryStatus: z.enum(['delivered', 'retrying', 'failed']).nullable(),
    })
    .nullable(),
})
export type SyncWebhookSettings = z.infer<typeof syncWebhookSettingsSchema>
