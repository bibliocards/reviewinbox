import { appResponseSchema, createAppRequestSchema, listAppsResponseSchema } from '@reviewinbox/contracts'
import { apps } from '@reviewinbox/db'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'

import { requireActiveOrganizationOwnerSession, requireActiveOrganizationSession } from '../auth/session'
import { database } from '../db'
import { parseJsonBody, parseUuidParam } from '../http/validation'

export const appsRoutes = new Hono()

appsRoutes.get('/api/apps', async (context) => {
  const sessionResult = await requireActiveOrganizationSession(context)
  if (!sessionResult.ok) {
    return sessionResult.response
  }

  const rows = await database.query.apps.findMany({
    where: eq(apps.organizationId, sessionResult.session.organizationId),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  })

  return context.json(listAppsResponseSchema.parse({ apps: rows.map(toAppResponse) }))
})

appsRoutes.post('/api/apps', async (context) => {
  const sessionResult = await requireActiveOrganizationOwnerSession(context)
  if (!sessionResult.ok) {
    return sessionResult.response
  }

  const bodyResult = await parseJsonBody(context, createAppRequestSchema)
  if (!bodyResult.ok) {
    return bodyResult.response
  }

  const [created] = await database
    .insert(apps)
    .values({
      organizationId: sessionResult.session.organizationId,
      name: bodyResult.data.name,
    })
    .returning()

  if (!created) {
    throw new Error('App creation did not return a row.')
  }

  return context.json(appResponseSchema.parse(toAppResponse(created)), 201)
})

appsRoutes.get('/api/apps/:appId', async (context) => {
  const sessionResult = await requireActiveOrganizationSession(context)
  if (!sessionResult.ok) {
    return sessionResult.response
  }

  const appIdResult = parseUuidParam(context, 'appId', 'App')
  if (!appIdResult.ok) {
    return appIdResult.response
  }

  const row = await database.query.apps.findFirst({
    where: and(eq(apps.id, appIdResult.data), eq(apps.organizationId, sessionResult.session.organizationId)),
  })

  if (!row) {
    return context.json({ error: 'App not found.' }, 404)
  }

  return context.json(appResponseSchema.parse(toAppResponse(row)))
})

type AppRow = typeof apps.$inferSelect

function toAppResponse(app: AppRow) {
  return {
    id: app.id,
    name: app.name,
    createdAt: app.createdAt.toISOString(),
    updatedAt: app.updatedAt.toISOString(),
  }
}
