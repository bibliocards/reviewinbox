import { z } from "zod"

export const appResponseSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type AppResponse = z.infer<typeof appResponseSchema>

export const listAppsResponseSchema = z.object({
  apps: z.array(appResponseSchema),
})
export type ListAppsResponse = z.infer<typeof listAppsResponseSchema>

export const createAppRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
  })
  .strict()
export type CreateAppRequest = z.infer<typeof createAppRequestSchema>
