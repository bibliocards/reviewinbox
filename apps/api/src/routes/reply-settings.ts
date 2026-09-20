import { replySettingsResponseSchema, updateReplySettingsRequestSchema } from '@reviewinbox/contracts'
import { apps } from '@reviewinbox/db'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'

import { requireActiveOrganizationOwnerSession, requireActiveOrganizationSession } from '../auth/session'
import { database } from '../db'
import { parseJsonBody, parseUuidParam } from '../http/validation'

type ReplySettingsRouteDependencies = {
  database: typeof database
  requireSession: typeof requireActiveOrganizationSession
  requireOwnerSession: typeof requireActiveOrganizationOwnerSession
}

const defaultDependencies: ReplySettingsRouteDependencies = {
  database,
  requireSession: requireActiveOrganizationSession,
  requireOwnerSession: requireActiveOrganizationOwnerSession,
}

export function createReplySettingsRoutes(dependencies: ReplySettingsRouteDependencies = defaultDependencies): Hono {
  const routes = new Hono()

  routes.get('/api/apps/:appId/reply-settings', async (context) => {
    const sessionResult = await dependencies.requireSession(context)
    if (!sessionResult.ok) {
      return sessionResult.response
    }

    const appIdResult = parseUuidParam(context, 'appId', 'App')
    if (!appIdResult.ok) {
      return appIdResult.response
    }

    const app = await dependencies.database.query.apps.findFirst({
      where: and(eq(apps.id, appIdResult.data), eq(apps.organizationId, sessionResult.session.organizationId)),
    })

    if (!app) {
      return context.json({ error: 'App not found.' }, 404)
    }

    return context.json(replySettingsResponseSchema.parse(toReplySettingsResponse(app)))
  })

  routes.patch('/api/apps/:appId/reply-settings', async (context) => {
    const sessionResult = await dependencies.requireOwnerSession(context)
    if (!sessionResult.ok) {
      return sessionResult.response
    }

    const appIdResult = parseUuidParam(context, 'appId', 'App')
    if (!appIdResult.ok) {
      return appIdResult.response
    }

    const bodyResult = await parseJsonBody(context, updateReplySettingsRequestSchema)
    if (!bodyResult.ok) {
      return bodyResult.response
    }

    const [updatedApp] = await dependencies.database
      .update(apps)
      .set({
        replyContext: bodyResult.data.replyContext,
        defaultLanguage: bodyResult.data.defaultLanguage,
        mappedLanguages: bodyResult.data.mappedLanguages,
      })
      .where(and(eq(apps.id, appIdResult.data), eq(apps.organizationId, sessionResult.session.organizationId)))
      .returning()

    if (!updatedApp) {
      return context.json({ error: 'App not found.' }, 404)
    }

    return context.json(replySettingsResponseSchema.parse(toReplySettingsResponse(updatedApp)))
  })

  return routes
}

export const replySettingsRoutes = createReplySettingsRoutes()

type AppRow = typeof apps.$inferSelect

export function toReplySettingsResponse(app: AppRow) {
  return {
    appId: app.id,
    replyContext: app.replyContext,
    defaultLanguage: app.defaultLanguage,
    mappedLanguages: app.mappedLanguages,
    updatedAt: app.updatedAt.toISOString(),
  }
}
