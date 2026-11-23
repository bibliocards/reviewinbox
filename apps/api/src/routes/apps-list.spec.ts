import { listAppsResponseSchema } from '@reviewinbox/contracts'
import { apps, createDatabase, storeConnections, syncRuns } from '@reviewinbox/db'
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
  lastSuccessfulSyncAt: Date | null
  syncIncidentErrorCode: string | null
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
  leftJoinLateral: (...joins: unknown[]) => ConnectionSelectBuilder
  where: () => ConnectionSelectBuilder
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

const noRunRow: QueryRow = {
  connection: connectionRow,
  credential: null,
  lastSyncRun: null,
  lastSuccessfulSyncAt: null,
  syncIncidentErrorCode: null,
}
const latestRunRow: QueryRow = {
  ...noRunRow,
  lastSuccessfulSyncAt: new Date('2026-10-01T11:02:00.000Z'),
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
  const appsBuilder: AppsSelectBuilder = {
    from: () => appsBuilder,
    where: () => appsBuilder,
    orderBy: () => Promise.resolve(options.apps ?? [appRow()]),
  }
  const connectionBuilder: ConnectionSelectBuilder = {
    from: () => connectionBuilder,
    leftJoin: () => connectionBuilder,
    leftJoinLateral: () => connectionBuilder,
    where: () => connectionBuilder,
    orderBy: () => Promise.resolve(options.rows ?? [noRunRow]),
  }
  const select = vi
    .fn<
      (
        fields?: Parameters<typeof queryTestDatabase.select>[0],
      ) => AppsSelectBuilder | ConnectionSelectBuilder | ReturnType<typeof queryTestDatabase.select>
    >()
    .mockReturnValueOnce(appsBuilder)
    .mockImplementationOnce(queryTestDatabase.select.bind(queryTestDatabase))
    .mockReturnValueOnce(connectionBuilder)
  Object.defineProperty(testDatabase, 'select', { configurable: true, value: select })
  const requireSession = vi
    .fn<(context: Context) => Promise<SessionResult>>()
    .mockResolvedValue({ ok: true, session: { organizationId, role: 'owner', userId: 'user-1' } })
  return createAppsListRoutes({ database: testDatabase, requireSession })
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
    const routes = createHarness({ apps: [savedApp, defaultApp] })

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
    const routes = createHarness({ rows: [latestRunRow] })
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
    expect(body.apps[0]?.storeConnections[0]?.lastSuccessfulSyncAt).toBe('2026-10-01T11:02:00.000Z')
    expect(JSON.stringify(body)).not.toContain('checkpoint')
    expect(JSON.stringify(body)).not.toContain('errorMessage')
    expect(JSON.stringify(body)).not.toContain('ciphertext')
  })

  it('returns null when a Store Connection has no recorded Sync Run', async () => {
    const routes = createHarness({ rows: [noRunRow] })

    const response = await routes.request('http://localhost/api/apps')

    expect(response.status).toBe(200)
    const body = listAppsResponseSchema.parse(await response.json())
    expect(body.apps[0]?.storeConnections[0]?.lastSyncRun).toBeNull()
  })
})

describe('GET /api/apps query', () => {
  it('excludes private fields from the Store Connection and Sync Run projections', () => {
    const { sql } = createAppListStoreConnectionsQuery(queryTestDatabase, organizationId).toSQL()
    expect(sql).not.toContain('"sync_runs"."checkpoint"')
    expect(sql).not.toContain('"sync_runs"."error_message"')
    expect(sql).not.toContain('"store_credentials"."ciphertext"')
  })

  it('scopes the App query to the active Organization', () => {
    const appQuery = createOrganizationAppsQuery(queryTestDatabase, organizationId).toSQL()
    expect(appQuery.params).toContain(organizationId)
  })
})
