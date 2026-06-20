import { z } from 'zod'
import { storeConnectionResponseSchema } from './store'

export const appResponseSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  autoDraftEnabled: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type AppResponse = z.infer<typeof appResponseSchema>

export const appListItemResponseSchema = appResponseSchema.extend({
  storeConnections: z.array(storeConnectionResponseSchema),
})
export type AppListItemResponse = z.infer<typeof appListItemResponseSchema>

export const listAppsResponseSchema = z.object({
  apps: z.array(appListItemResponseSchema),
})
export type ListAppsResponse = z.infer<typeof listAppsResponseSchema>

export const createAppRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
  })
  .strict()
export type CreateAppRequest = z.infer<typeof createAppRequestSchema>

export const connectAppRequestSchema = z
  .object({
    app: createAppRequestSchema,
    connections: z
      .object({
        apple: z
          .object({
            appStoreAppId: z.string().trim().min(1).max(512),
            issuerId: z.string().trim().min(1).max(512),
            keyId: z.string().trim().min(1).max(512),
            privateKey: z
              .string()
              .trim()
              .min(1)
              .max(64 * 1024),
          })
          .strict()
          .optional(),
        google: z
          .object({
            packageName: z.string().trim().min(1).max(512),
            serviceAccountJson: z
              .string()
              .trim()
              .min(1)
              .max(64 * 1024),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
export type ConnectAppRequest = z.infer<typeof connectAppRequestSchema>

export const updateAppRequestSchema = z
  .object({
    app: createAppRequestSchema,
    connections: z
      .object({
        apple: z
          .object({
            appStoreAppId: z.string().trim().min(1).max(512),
            issuerId: z.string().trim().min(1).max(512),
            keyId: z.string().trim().min(1).max(512).optional(),
            privateKey: z
              .string()
              .trim()
              .min(1)
              .max(64 * 1024)
              .optional(),
          })
          .strict()
          .optional(),
        google: z
          .object({
            packageName: z.string().trim().min(1).max(512),
            serviceAccountJson: z
              .string()
              .trim()
              .min(1)
              .max(64 * 1024)
              .optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
export type UpdateAppRequest = z.infer<typeof updateAppRequestSchema>

export const connectAppResponseSchema = z.object({
  app: appResponseSchema,
  storeConnections: z.array(storeConnectionResponseSchema),
})
export type ConnectAppResponse = z.infer<typeof connectAppResponseSchema>

export const updateAppResponseSchema = connectAppResponseSchema
export type UpdateAppResponse = z.infer<typeof updateAppResponseSchema>

export const deleteAppResponseSchema = z.object({
  id: z.uuid(),
})
export type DeleteAppResponse = z.infer<typeof deleteAppResponseSchema>

export const queueMissingReplyDraftsResponseSchema = z.object({
  queuedCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
})
export type QueueMissingReplyDraftsResponse = z.infer<typeof queueMissingReplyDraftsResponseSchema>
