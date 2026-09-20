import {
  replySettingsResponseSchema,
  updateReplySettingsRequestSchema,
} from '@reviewinbox/contracts'
import { apps } from '@reviewinbox/db'
import { and, eq, type SQL } from 'drizzle-orm'
import type { Context } from 'hono'
import { Hono } from 'hono'

import {
  requireActiveOrganizationOwnerSession,
  requireActiveOrganizationSession,
} from '../auth/session'
import { database } from '../db'
import { parseJsonBody, parseUuidParam } from '../http/validation'

type ReplySettingsAppRow = typeof apps.$inferSelect
type ReplySettingsInsert = typeof apps.$inferInsert
type ReplySettingsDatabase = {
  query: { apps: { findFirst: typeof database.query.apps.findFirst } }
  update: (table: typeof apps) => {
    set: (
      values: Pick<ReplySettingsInsert, 'replyContext' | 'defaultLanguage' | 'mappedLanguages'>,
    ) => {
      where: (condition: SQL | undefined) => { returning: () => Promise<ReplySettingsAppRow[]> }
    }
  }
}

export type ReplySettingsRouteDependencies = {
  database: ReplySettingsDatabase
  requireSession: typeof requireActiveOrganizationSession
  requireOwnerSession: typeof requireActiveOrganizationOwnerSession
}

const defaultDependencies: ReplySettingsRouteDependencies = {
  database,
  requireSession: requireActiveOrganizationSession,
  requireOwnerSession: requireActiveOrganizationOwnerSession,
}

export function createReplySettingsRoutes(
  dependencies: ReplySettingsRouteDependencies = defaultDependencies,
): Hono {
  const routes = new Hono()

  routes.get('/api/apps/:appId/reply-settings', (context) =>
    getReplySettings(context, dependencies),
  )

  routes.patch('/api/apps/:appId/reply-settings', (context) =>
    updateReplySettings(context, dependencies),
  )

  return routes
}

type AppRow = ReplySettingsAppRow
type SessionResult = Awaited<ReturnType<typeof requireActiveOrganizationSession>>
type SessionChecker = (context: Context) => Promise<SessionResult>
type ScopedApp = { appId: string; organizationId: string }
type ScopedAppInputResult = { ok: true; scope: ScopedApp } | { ok: false; response: Response }
type ScopedAppResult = { ok: true; app: AppRow } | { ok: false; response: Response }

async function loadScopedAppInput(
  context: Context,
  requireSession: SessionChecker,
): Promise<ScopedAppInputResult> {
  const sessionResult = await requireSession(context)
  if (!sessionResult.ok) {
    return sessionResult
  }

  const appIdResult = parseUuidParam(context, 'appId', 'App')
  if (!appIdResult.ok) {
    return appIdResult
  }

  return {
    ok: true,
    scope: { appId: appIdResult.data, organizationId: sessionResult.session.organizationId },
  }
}

function scopedAppCondition(scope: ScopedApp) {
  return and(eq(apps.id, scope.appId), eq(apps.organizationId, scope.organizationId))
}

async function loadScopedApp(
  context: Context,
  dependencies: ReplySettingsRouteDependencies,
  requireSession: SessionChecker,
): Promise<ScopedAppResult> {
  const inputResult = await loadScopedAppInput(context, requireSession)
  if (!inputResult.ok) {
    return inputResult
  }

  const app = await dependencies.database.query.apps.findFirst({
    where: scopedAppCondition(inputResult.scope),
  })
  if (!app) {
    return { ok: false, response: context.json({ error: 'App not found.' }, 404) }
  }

  return { ok: true, app }
}

async function getReplySettings(context: Context, dependencies: ReplySettingsRouteDependencies) {
  const appResult = await loadScopedApp(context, dependencies, dependencies.requireSession)
  if (!appResult.ok) {
    return appResult.response
  }

  return context.json(replySettingsResponseSchema.parse(toReplySettingsResponse(appResult.app)))
}

async function updateReplySettings(context: Context, dependencies: ReplySettingsRouteDependencies) {
  const inputResult = await loadScopedAppInput(context, dependencies.requireOwnerSession)
  if (!inputResult.ok) {
    return inputResult.response
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
    .where(scopedAppCondition(inputResult.scope))
    .returning()
  if (!updatedApp) {
    return context.json({ error: 'App not found.' }, 404)
  }

  return context.json(replySettingsResponseSchema.parse(toReplySettingsResponse(updatedApp)))
}

export const replySettingsRoutes = createReplySettingsRoutes()

export function toReplySettingsResponse(app: AppRow) {
  return {
    appId: app.id,
    replyContext: app.replyContext,
    defaultLanguage: app.defaultLanguage,
    mappedLanguages: app.mappedLanguages,
    updatedAt: app.updatedAt.toISOString(),
  }
}
