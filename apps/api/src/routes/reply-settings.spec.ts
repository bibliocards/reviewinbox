import { describe, expect, it, vi } from 'vitest'

import { createReplySettingsRoutes } from './reply-settings'

const appId = '11111111-1111-4111-8111-111111111111'
const organizationId = 'organization-1'

function appRow(overrides: Record<string, unknown> = {}) {
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
  options: { app?: Record<string, unknown> | null; ownerAllowed?: boolean; updated?: Record<string, unknown> | null } = {},
) {
  const findFirst = vi.fn().mockResolvedValue(options.app === null ? undefined : (options.app ?? appRow()))
  const returning = vi.fn().mockResolvedValue(options.updated === null ? [] : [options.updated ?? appRow()])
  const where = vi.fn().mockReturnValue({ returning })
  const set = vi.fn().mockReturnValue({ where })
  const update = vi.fn().mockReturnValue({ set })
  const database = {
    query: { apps: { findFirst } },
    update,
  }
  const requireSession = vi.fn().mockResolvedValue({
    ok: true,
    session: { userId: 'user-1', organizationId, role: 'member' },
  })
  const requireOwnerSession = vi
    .fn()
    .mockResolvedValue(
      options.ownerAllowed === false
        ? { ok: false, response: new Response(JSON.stringify({ error: 'Organization Owner permission required.' }), { status: 403 }) }
        : { ok: true, session: { userId: 'user-1', organizationId, role: 'owner' } },
    )

  return {
    routes: createReplySettingsRoutes({ database: database as never, requireSession, requireOwnerSession }),
    findFirst,
    update,
    set,
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
    const { routes, set } = routeHarness()

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
    expect(set).toHaveBeenCalledWith({ replyContext: 'Be warm.', defaultLanguage: 'fr', mappedLanguages: ['en'] })
    expect(await response.json()).toMatchObject({ appId, replyContext: 'Be concise.', defaultLanguage: 'en' })
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
    const { routes, update } = routeHarness()

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
