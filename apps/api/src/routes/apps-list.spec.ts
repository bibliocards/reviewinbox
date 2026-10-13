import { listAppsResponseSchema } from '@reviewinbox/contracts'
import { apps, createDatabase, storeConnections, syncRuns } from '@reviewinbox/db'
import type { SQL } from 'drizzle-orm'
import type { Context } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import { requireActiveOrganizationSession } from '../auth/session'
import {
  createAppListStoreConnectionsQuery,
  createAppsListRoutes,
  createOrganizationAppsQuery,
} from './apps'

const organizationId = 'organization-1'
const appId = '11111111-1111-4111-8111-111111111111'
const connectionId = '22222222-2222-4222-8222-222222222222'
const runIds = ['33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444']
const testDatabase = createDatabase('postgres://apps-list-test')
const queryTestDatabase = createDatabase('postgres://apps-list-query-test')

type AppRow = typeof apps.$inferSelect
type ConnectionRow = typeof storeConnections.$inferSelect
type SessionResult = Awaited<ReturnType<typeof requireActiveOrganizationSession>>
type QueryRow = {
  connection: ConnectionRow
  credential: { updatedAt: Date | null; keyId: string | null } | null
  lastSyncRun: {
    id: string | null
    status: (typeof syncRuns.$inferSelect)['status'] | null
    startedAt: Date | null
    finishedAt: Date | null
    createdAt: Date | null
    fetchedCount: number | null
    storedCount: number | null
    errorCode: string | null
  } | null
}
type ConnectionSelectBuilder = {
  from: () => ConnectionSelectBuilder
  leftJoin: (...joins: unknown[]) => ConnectionSelectBuilder
  where: (condition: SQL | undefined) => ConnectionSelectBuilder
  orderBy: (...ordering: unknown[]) => Promise<QueryRow[]>
}
type AppsSelectBuilder = {
  from: () => AppsSelectBuilder
  where: () => AppsSelectBuilder
  orderBy: () => Promise<AppRow[]>
}

const appRow = (input: Partial<AppRow> = {}): AppRow => ({
  id: appId,
  organizationId,
  name: 'Bibliocards',
  autoDraftEnabled: true,
  topicDiscoveryRequestedAt: null,
  lastTopicDiscoveryAt: null,
  replyContext: '',
  defaultLanguage: 'fr',
  mappedLanguages: ['en', 'ja'],
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
  updatedAt: new Date('2026-10-01T10:00:00.000Z'),
  ...input,
})

const connectionRow: ConnectionRow = {
  id: connectionId,
  organizationId,
  appId,
  provider: 'google_play',
  status: 'active',
  externalAppId: 'com.example.app',
  externalStoreId: null,
  displayName: null,
  appleVersionLookup: null,
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
  updatedAt: new Date('2026-10-01T10:00:00.000Z'),
}

const noRunRow: QueryRow = { connection: connectionRow, credential: null, lastSyncRun: null }
const latestRunRow: QueryRow = {
  ...noRunRow,
  lastSyncRun: {
    id: runIds[1],
    status: 'failed',
    startedAt: new Date('2026-10-02T11:00:00.000Z'),
    finishedAt: new Date('2026-10-02T11:02:00.000Z'),
    createdAt: new Date('2026-10-02T11:00:00.000Z'),
    fetchedCount: 2,
    storedCount: 0,
    errorCode: 'invalid_credential',
  },
}

function createHarness(options: { apps?: AppRow[]; rows?: QueryRow[] } = {}) {
  let appsBuilder: AppsSelectBuilder
  appsBuilder = {
    from: vi.fn<() => AppsSelectBuilder>(() => appsBuilder),
    where: vi.fn<() => AppsSelectBuilder>(() => appsBuilder),
    orderBy: vi.fn<() => Promise<AppRow[]>>(() => Promise.resolve(options.apps ?? [appRow()])),
  }
  const selectApps = vi.fn<() => AppsSelectBuilder>(() => appsBuilder)
  Object.defineProperty(testDatabase, 'select', { configurable: true, value: selectApps })

  let builder: ConnectionSelectBuilder
  const where = vi.fn<(condition: SQL | undefined) => ConnectionSelectBuilder>(() => builder)
  const selectDistinctOn = vi.fn<(...args: unknown[]) => ConnectionSelectBuilder>(() => builder)
  builder = {
    from: vi.fn<() => ConnectionSelectBuilder>(() => builder),
    leftJoin: vi.fn<(...joins: unknown[]) => ConnectionSelectBuilder>(() => builder),
    where,
    orderBy: vi.fn<(...ordering: unknown[]) => Promise<QueryRow[]>>(() =>
      Promise.resolve(options.rows ?? [noRunRow]),
    ),
  }
  Object.defineProperty(testDatabase, 'selectDistinctOn', {
    configurable: true,
    value: selectDistinctOn,
  })
  const requireSession = vi
    .fn<(context: Context) => Promise<SessionResult>>()
    .mockResolvedValue({ ok: true, session: { organizationId, role: 'owner', userId: 'user-1' } })
  const routes = createAppsListRoutes({ database: testDatabase, requireSession })
  return { routes, builder, selectApps, selectDistinctOn, requireSession }
}

describe('GET /api/apps reply language policy', () => {
  it('returns the saved reply language policy and the default policy for each App', async () => {
    const savedApp = appRow()
    const defaultApp = appRow({
      id: '55555555-5555-4555-8555-555555555555',
      name: 'New App',
      defaultLanguage: 'en',
      mappedLanguages: [],
    })
    const { routes } = createHarness({ apps: [savedApp, defaultApp] })

    const response = await routes.request('http://localhost/api/apps')

    expect(response.status).toBe(200)
    expect(listAppsResponseSchema.parse(await response.json())).toMatchObject({
      apps: [
        {
          id: appId,
          replyLanguagePolicy: { defaultLanguage: 'fr', mappedLanguages: ['en', 'ja'] },
        },
        { id: defaultApp.id, replyLanguagePolicy: { defaultLanguage: 'en', mappedLanguages: [] } },
      ],
    })
  })
})

describe('GET /api/apps Store Connection Sync Run summary', () => {
  it('returns the selected Sync Run summary without sensitive fields', async () => {
    const { routes, builder } = createHarness({ rows: [latestRunRow] })
    const response = await routes.request('http://localhost/api/apps')
    const body = listAppsResponseSchema.parse(await response.json())

    expect(response.status).toBe(200)
    expect(body.apps[0]?.storeConnections[0]?.lastSyncRun).toEqual({
      id: runIds[1],
      status: 'failed',
      startedAt: '2026-10-02T11:00:00.000Z',
      finishedAt: '2026-10-02T11:02:00.000Z',
      createdAt: '2026-10-02T11:00:00.000Z',
      fetchedCount: 2,
      storedCount: 0,
      errorCode: 'invalid_credential',
    })
    expect(JSON.stringify(body)).not.toContain('checkpoint')
    expect(JSON.stringify(body)).not.toContain('errorMessage')
    expect(JSON.stringify(body)).not.toContain('ciphertext')
    expect(builder.leftJoin).toHaveBeenCalledTimes(2)
    expect(builder.orderBy).toHaveBeenCalledTimes(1)
  })

  it('returns null when a Store Connection has no recorded Sync Run', async () => {
    const { routes } = createHarness({ rows: [noRunRow] })

    const response = await routes.request('http://localhost/api/apps')

    expect(response.status).toBe(200)
    const body = listAppsResponseSchema.parse(await response.json())
    expect(body.apps[0]?.storeConnections[0]?.lastSyncRun).toBeNull()
  })
})

describe('GET /api/apps Store Connection query', () => {
  it('selects one Organization-scoped row per connection in newest-first order', () => {
    const { sql, params } = createAppListStoreConnectionsQuery(
      queryTestDatabase,
      organizationId,
    ).toSQL()

    expect(sql).toContain('distinct on ("store_connections"."id")')
    expect(sql).toContain(
      'order by "store_connections"."id", "sync_runs"."created_at" desc, "sync_runs"."id" desc',
    )
    expect(params.filter((value) => value === organizationId)).toHaveLength(2)
    expect(sql).not.toContain('"sync_runs"."checkpoint"')
    expect(sql).not.toContain('"sync_runs"."error_message"')
    expect(sql).not.toContain('"store_credentials"."ciphertext"')
  })

  it('scopes the App and Store Connection queries to the active Organization', async () => {
    const appQuery = createOrganizationAppsQuery(queryTestDatabase, organizationId).toSQL()
    const { routes, selectApps, selectDistinctOn } = createHarness()
    const response = await routes.request('http://localhost/api/apps')

    expect(response.status).toBe(200)
    expect(appQuery.params).toContain(organizationId)
    expect(selectApps).toHaveBeenCalledTimes(1)
    expect(selectDistinctOn).toHaveBeenCalledTimes(1)
  })
})
