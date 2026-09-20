import { createDatabase } from '@reviewinbox/db'
import { describe, expect, it, vi } from 'vitest'

import {
  createStoreConnectionsRoutes,
  type StoreConnectionRouteDependencies,
} from './store-connections'

const connectionId = '11111111-1111-4111-8111-111111111111'
const appId = '22222222-2222-4222-8222-222222222222'
const organizationId = 'organization-1'
const credentialRevision = new Date('2026-09-20T10:00:00.000Z')
const activationRevision = new Date('2026-09-20T11:00:00.000Z')
const testDatabase = createDatabase('postgres://store-connections-test')

type TestConnection = {
  id: string
  organizationId: string
  appId: string
  provider: 'google_play'
  status: 'active' | 'disabled'
  externalAppId: string | null
  externalStoreId: string | null
  displayName: string | null
  createdAt: Date
  updatedAt: Date
}
type TestCredential = ReturnType<typeof credential>
type ScopedConnection = { connection: TestConnection; credential: TestCredential | null }
type ConnectionSelectBuilder = {
  from: () => ConnectionSelectBuilder
  leftJoin: () => ConnectionSelectBuilder
  where: () => Promise<ScopedConnection[]>
}
type SettledSyncSelectBuilder = {
  from: () => SettledSyncSelectBuilder
  where: () => SettledSyncSelectBuilder
  orderBy: () => SettledSyncSelectBuilder
  limit: () => Promise<Array<{ startedAt: Date }>>
}
type TestSelectBuilder = ConnectionSelectBuilder | SettledSyncSelectBuilder
type TestReturningBuilder = { returning: () => Promise<TestConnection[]> }
type TestWhereUpdateBuilder = { where: () => TestReturningBuilder }
type TestUpdateValues = Partial<TestConnection> & { updatedAt?: Date }
type TestUpdateBuilder = { set: (values: TestUpdateValues) => TestWhereUpdateBuilder }

const testState = {
  select: vi.fn<() => TestSelectBuilder>(),
  update: vi.fn<() => TestUpdateBuilder>(),
  requireOwnerSession:
    vi.fn<StoreConnectionRouteDependencies['requireActiveOrganizationOwnerSession']>(),
  enqueueInitialSync:
    vi.fn<StoreConnectionRouteDependencies['enqueueInitialStoreConnectionSyncJobs']>(),
}

Object.defineProperties(testDatabase, {
  select: { configurable: true, value: testState.select },
  update: { configurable: true, value: testState.update },
})

const storeConnectionsRoutes = createStoreConnectionsRoutes({
  database: testDatabase,
  serverConfig: { deploymentMode: 'self-hosted' },
  requireActiveOrganizationOwnerSession: testState.requireOwnerSession,
  enqueueInitialStoreConnectionSyncJobs: testState.enqueueInitialSync,
})

function connection(status: 'active' | 'disabled' = 'disabled'): TestConnection {
  return {
    id: connectionId,
    organizationId,
    appId,
    provider: 'google_play' as const,
    status,
    externalAppId: 'com.example.app',
    externalStoreId: null,
    displayName: null,
    createdAt: new Date('2026-09-20T09:00:00.000Z'),
    updatedAt: new Date('2026-09-20T09:30:00.000Z'),
  }
}

function credential() {
  return { updatedAt: credentialRevision, keyId: 'credential-key-id' }
}

function connectionSelect(row: ScopedConnection) {
  const from = vi.fn<() => ConnectionSelectBuilder>()
  const leftJoin = vi.fn<() => ConnectionSelectBuilder>()
  const where = vi.fn<() => Promise<ScopedConnection[]>>().mockResolvedValue([row])
  const builder: ConnectionSelectBuilder = { from, leftJoin, where }
  from.mockReturnValue(builder)
  leftJoin.mockReturnValue(builder)
  return { from, leftJoin, where }
}

function settledSyncSelect(latestSettledAt: Date | null) {
  const from = vi.fn<() => SettledSyncSelectBuilder>()
  const where = vi.fn<() => SettledSyncSelectBuilder>()
  const orderBy = vi.fn<() => SettledSyncSelectBuilder>()
  const limit = vi
    .fn<() => Promise<Array<{ startedAt: Date }>>>()
    .mockResolvedValue(latestSettledAt ? [{ startedAt: latestSettledAt }] : [])
  const builder: SettledSyncSelectBuilder = { from, where, orderBy, limit }
  from.mockReturnValue(builder)
  where.mockReturnValue(builder)
  orderBy.mockReturnValue(builder)
  return { from, where, orderBy, limit }
}

function nextSelectResult(results: TestSelectBuilder[]): TestSelectBuilder {
  const result = results.shift()
  return result ?? settledSyncSelect(null)
}

function configureRouteHarness(
  options: {
    credential?: TestCredential | null
    existingStatus?: 'active' | 'disabled'
    updatedStatus?: 'active' | 'disabled'
    updatedExternalAppId?: string | null
    updatedExternalStoreId?: string | null
    updatedDisplayName?: string | null
    latestSettledAt?: Date | null
  } = {},
) {
  vi.clearAllMocks()
  const existing = {
    connection: connection(options.existingStatus),
    credential: options.credential === undefined ? credential() : options.credential,
  }
  const updated = {
    ...existing.connection,
    status: options.updatedStatus ?? ('active' as const),
    externalAppId:
      options.updatedExternalAppId === undefined
        ? existing.connection.externalAppId
        : options.updatedExternalAppId,
    externalStoreId:
      options.updatedExternalStoreId === undefined
        ? existing.connection.externalStoreId
        : options.updatedExternalStoreId,
    displayName:
      options.updatedDisplayName === undefined
        ? existing.connection.displayName
        : options.updatedDisplayName,
    updatedAt: activationRevision,
  }
  const latestSettledAt =
    options.latestSettledAt === undefined
      ? new Date('2026-09-20T12:00:00.000Z')
      : options.latestSettledAt
  const returning = vi.fn<() => Promise<TestConnection[]>>().mockResolvedValue([updated])
  const whereUpdate = vi.fn<() => TestReturningBuilder>().mockReturnValue({ returning })
  const set = vi
    .fn<(values: TestUpdateValues) => TestWhereUpdateBuilder>()
    .mockReturnValue({ where: whereUpdate })
  const selectResults = [
    connectionSelect({ connection: existing.connection, credential: existing.credential }),
    settledSyncSelect(latestSettledAt),
  ]

  testState.select.mockImplementation(() => nextSelectResult(selectResults))
  testState.update.mockReturnValue({ set })
  testState.requireOwnerSession.mockResolvedValue({
    ok: true,
    session: { organizationId, role: 'owner', userId: 'user-1' },
  })
  testState.enqueueInitialSync.mockImplementation((input) =>
    Promise.resolve(
      input.connections.length > 0
        ? {
            status: 'queued',
            queuedStoreConnectionIds: [connectionId],
            failedStoreConnectionIds: [],
          }
        : { status: 'not_requested', queuedStoreConnectionIds: [], failedStoreConnectionIds: [] },
    ),
  )

  return { existing, updated, set }
}

describe('Store Connection activation', () => {
  it('queues an initial sync with the activation revision for a verified disabled connection', async () => {
    const { set } = configureRouteHarness()

    const response = await storeConnectionsRoutes.request(
      `http://localhost/api/store-connections/${connectionId}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      },
    )

    expect(response.status).toBe(200)
    expect(set).toHaveBeenCalledTimes(1)
    expect(set.mock.calls[0]?.[0]).toMatchObject({ status: 'active' })
    expect(testState.enqueueInitialSync).toHaveBeenCalledWith({
      organizationId,
      connections: [{ storeConnectionId: connectionId, revisionAt: activationRevision }],
    })
    expect(await response.json()).toMatchObject({
      id: connectionId,
      status: 'active',
      initialSync: { status: 'queued', queuedStoreConnectionIds: [connectionId] },
    })
  })

  it('does not claim an import was queued when activation has no verified credential', async () => {
    configureRouteHarness({ credential: null })

    const response = await storeConnectionsRoutes.request(
      `http://localhost/api/store-connections/${connectionId}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      },
    )

    expect(response.status).toBe(200)
    expect(testState.enqueueInitialSync).toHaveBeenCalledWith({ organizationId, connections: [] })
    expect(await response.json()).toMatchObject({
      status: 'active',
      initialSync: { status: 'not_requested' },
    })
  })

  it('returns a failed initial-sync status when the queue cannot accept activation', async () => {
    configureRouteHarness()
    testState.enqueueInitialSync.mockResolvedValueOnce({
      status: 'failed',
      queuedStoreConnectionIds: [],
      failedStoreConnectionIds: [connectionId],
    })

    const response = await storeConnectionsRoutes.request(
      `http://localhost/api/store-connections/${connectionId}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      },
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      initialSync: { status: 'failed', failedStoreConnectionIds: [connectionId] },
    })
  })
})

describe('Store Connection retry', () => {
  it.each([
    {
      kind: 'identifier',
      options: { existingStatus: 'active' as const, updatedExternalAppId: 'com.example.updated' },
      requestBody: { externalAppId: 'com.example.updated' },
    },
    { kind: 'activation', options: {}, requestBody: { status: 'active' as const } },
  ])(
    'retries an identical $kind PATCH after persistence succeeds but enqueue fails',
    async ({ options, requestBody }) => {
      const { existing, updated } = configureRouteHarness(options)
      const secondExisting = { connection: updated, credential: existing.credential }
      const selectResults = [
        connectionSelect({ connection: existing.connection, credential: existing.credential }),
        connectionSelect(secondExisting),
        settledSyncSelect(null),
      ]
      testState.select.mockImplementation(() => nextSelectResult(selectResults))
      testState.enqueueInitialSync
        .mockResolvedValueOnce({
          status: 'failed',
          queuedStoreConnectionIds: [],
          failedStoreConnectionIds: [connectionId],
        })
        .mockResolvedValueOnce({
          status: 'queued',
          queuedStoreConnectionIds: [connectionId],
          failedStoreConnectionIds: [],
        })

      const request = () =>
        storeConnectionsRoutes.request(`http://localhost/api/store-connections/${connectionId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(requestBody),
        })

      const firstResponse = await request()
      const secondResponse = await request()

      expect(firstResponse.status).toBe(200)
      expect(await firstResponse.json()).toMatchObject({ initialSync: { status: 'failed' } })
      expect(secondResponse.status).toBe(200)
      expect(await secondResponse.json()).toMatchObject({ initialSync: { status: 'queued' } })
      expect(testState.enqueueInitialSync).toHaveBeenCalledTimes(2)
      expect(testState.enqueueInitialSync).toHaveBeenNthCalledWith(2, {
        organizationId,
        connections: [{ storeConnectionId: connectionId, revisionAt: activationRevision }],
      })
      expect(testState.update).toHaveBeenCalledTimes(1)
    },
  )
})

describe('Store Connection identifier changes', () => {
  it.each([
    {
      field: 'externalAppId' as const,
      value: 'com.example.updated',
      options: { updatedExternalAppId: 'com.example.updated' },
    },
    {
      field: 'externalStoreId' as const,
      value: 'issuer-updated',
      options: { updatedExternalStoreId: 'issuer-updated' },
    },
  ])(
    'queues an initial sync when an active verified connection changes $field',
    async ({ field, value, options }) => {
      configureRouteHarness({ existingStatus: 'active', ...options })

      const response = await storeConnectionsRoutes.request(
        `http://localhost/api/store-connections/${connectionId}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ [field]: value }),
        },
      )

      expect(response.status).toBe(200)
      expect(testState.enqueueInitialSync).toHaveBeenCalledWith({
        organizationId,
        connections: [{ storeConnectionId: connectionId, revisionAt: activationRevision }],
      })
      expect(await response.json()).toMatchObject({
        status: 'active',
        initialSync: { status: 'queued' },
      })
    },
  )
})

describe('Store Connection patches without credentials', () => {
  it('does not queue an identifier change when the connection has no credential', async () => {
    configureRouteHarness({
      existingStatus: 'active',
      credential: null,
      updatedExternalAppId: 'com.example.updated',
    })

    const response = await storeConnectionsRoutes.request(
      `http://localhost/api/store-connections/${connectionId}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ externalAppId: 'com.example.updated' }),
      },
    )

    expect(response.status).toBe(200)
    expect(testState.enqueueInitialSync).toHaveBeenCalledWith({ organizationId, connections: [] })
    expect(await response.json()).toMatchObject({
      status: 'active',
      initialSync: { status: 'not_requested' },
    })
  })

  it('does not queue an identifier change when the connection stays disabled', async () => {
    configureRouteHarness({
      existingStatus: 'disabled',
      updatedStatus: 'disabled',
      updatedExternalAppId: 'com.example.updated',
    })

    const response = await storeConnectionsRoutes.request(
      `http://localhost/api/store-connections/${connectionId}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ externalAppId: 'com.example.updated' }),
      },
    )

    expect(response.status).toBe(200)
    expect(testState.enqueueInitialSync).toHaveBeenCalledWith({ organizationId, connections: [] })
    expect(await response.json()).toMatchObject({
      status: 'disabled',
      initialSync: { status: 'not_requested' },
    })
  })
})

describe('Store Connection unchanged patches', () => {
  it('does not enqueue when the external identifiers are unchanged', async () => {
    configureRouteHarness({ existingStatus: 'active', updatedExternalAppId: 'com.example.app' })

    const response = await storeConnectionsRoutes.request(
      `http://localhost/api/store-connections/${connectionId}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ externalAppId: 'com.example.app' }),
      },
    )

    expect(response.status).toBe(200)
    expect(testState.enqueueInitialSync).not.toHaveBeenCalled()
    expect(await response.json()).not.toHaveProperty('initialSync')
  })

  it('keeps the sync revision stable for a display name change', async () => {
    const { existing, set } = configureRouteHarness({
      existingStatus: 'active',
      updatedDisplayName: 'Renamed app',
    })

    const response = await storeConnectionsRoutes.request(
      `http://localhost/api/store-connections/${connectionId}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: 'Renamed app' }),
      },
    )

    expect(response.status).toBe(200)
    expect(set).toHaveBeenCalledWith({
      displayName: 'Renamed app',
      updatedAt: existing.connection.updatedAt,
    })
    expect(testState.enqueueInitialSync).not.toHaveBeenCalled()
  })
})
