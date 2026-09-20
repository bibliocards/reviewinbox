import { apps, createDatabase } from '@reviewinbox/db'
import { and, eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'

import { createReplySettingsRoutes, type ReplySettingsRouteDependencies } from './reply-settings'

const appId = '11111111-1111-4111-8111-111111111111'
const organizationId = 'organization-1'
const testDatabase = createDatabase('postgres://reply-settings-test')

type AppRow = typeof apps.$inferSelect
type RouteDatabase = ReplySettingsRouteDependencies['database']
type UpdateBuilder = ReturnType<RouteDatabase['update']>
type SetValues = UpdateBuilder['set']
type WhereBuilder = ReturnType<SetValues>
type Where = WhereBuilder['where']
type ReturningBuilder = ReturnType<Where>
type Returning = ReturningBuilder['returning']

function appRow(overrides: Partial<AppRow> = {}): AppRow {
  return {
    id: appId,
    organizationId,
    name: 'ReviewInbox demo',
    autoDraftEnabled: true,
    replyContext: 'Be concise.',
    defaultLanguage: 'en',
    mappedLanguages: ['fr'],
    createdAt: new Date('2026-09-20T10:00:00.000Z'),
    updatedAt: new Date('2026-09-20T10:00:00.000Z'),
    ...overrides,
  }
}

function routeHarness(
  options: { app?: AppRow | null; ownerAllowed?: boolean; updated?: AppRow | null } = {},
) {
  const findFirst = vi
    .fn<() => Promise<AppRow | undefined>>()
    .mockResolvedValue(options.app === null ? undefined : (options.app ?? appRow()))
  const returning = vi
    .fn<Returning>()
    .mockResolvedValue(options.updated === null ? [] : [options.updated ?? appRow()])
  const whereConditions: Parameters<Where>[0][] = []
  const where = vi.fn<Where>((condition) => {
    whereConditions.push(condition)
    return { returning }
  })
  const set = vi.fn<SetValues>().mockReturnValue({ where })
  const update = vi.fn<RouteDatabase['update']>().mockReturnValue({ set })
  Object.defineProperty(testDatabase.query.apps, 'findFirst', {
    configurable: true,
    value: findFirst,
  })
  Object.defineProperty(testDatabase, 'update', { configurable: true, value: update })
  const requireSession = vi
    .fn<ReplySettingsRouteDependencies['requireSession']>()
    .mockResolvedValue({ ok: true, session: { userId: 'user-1', organizationId, role: 'member' } })
  const requireOwnerSession = vi
    .fn<ReplySettingsRouteDependencies['requireOwnerSession']>()
    .mockResolvedValue(
      options.ownerAllowed === false
        ? {
            ok: false,
            response: new Response(
              JSON.stringify({ error: 'Organization Owner permission required.' }),
              { status: 403 },
            ),
          }
        : { ok: true, session: { userId: 'user-1', organizationId, role: 'owner' } },
    )

  return {
    routes: createReplySettingsRoutes({
      database: testDatabase,
      requireSession,
      requireOwnerSession,
    }),
    findFirst,
    update,
    set,
    whereConditions,
    requireOwnerSession,
  }
}

describe('reply settings routes', () => {
  it('returns only the settings for an App visible in the active Organization', async () => {
    const { routes, findFirst } = routeHarness({ app: null })

    const response = await routes.request(`http://localhost/api/apps/${appId}/reply-settings`)

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'App not found.' })
    expect(findFirst).toHaveBeenCalledTimes(1)
  })

  it('allows an Organization Owner to update settings without exposing unrelated App fields', async () => {
    const { routes, set, whereConditions } = routeHarness()

    const response = await routes.request(`http://localhost/api/apps/${appId}/reply-settings`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        replyContext: '  Be warm.  ',
        defaultLanguage: ' fr ',
        mappedLanguages: [' en '],
      }),
    })

    expect(response.status).toBe(200)
    expect(set).toHaveBeenCalledWith({
      replyContext: 'Be warm.',
      defaultLanguage: 'fr',
      mappedLanguages: ['en'],
    })
    expect(whereConditions[0]?.queryChunks).toEqual(
      and(eq(apps.id, appId), eq(apps.organizationId, organizationId))?.queryChunks,
    )
    expect(await response.json()).toMatchObject({
      appId,
      replyContext: 'Be concise.',
      defaultLanguage: 'en',
    })
  })

  it('rejects settings changes from non-Owners', async () => {
    const { routes, update, requireOwnerSession } = routeHarness({ ownerAllowed: false })

    const response = await routes.request(`http://localhost/api/apps/${appId}/reply-settings`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ replyContext: '', defaultLanguage: 'en', mappedLanguages: [] }),
    })

    expect(response.status).toBe(403)
    expect(requireOwnerSession).toHaveBeenCalledTimes(1)
    expect(update).not.toHaveBeenCalled()
  })

  it('rejects oversized or privileged settings payloads before persistence', async () => {
    const { routes, findFirst, update } = routeHarness()

    const response = await routes.request(`http://localhost/api/apps/${appId}/reply-settings`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        replyContext: 'x'.repeat(4001),
        defaultLanguage: 'en',
        mappedLanguages: [],
        autoDraftEnabled: false,
      }),
    })

    expect(response.status).toBe(400)
    expect(findFirst).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('returns 404 when the scoped Owner update cannot find the App', async () => {
    const { routes } = routeHarness({ updated: null })

    const response = await routes.request(`http://localhost/api/apps/${appId}/reply-settings`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ replyContext: '', defaultLanguage: 'en', mappedLanguages: [] }),
    })

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'App not found.' })
  })
})
