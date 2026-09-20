import { describe, expect, it, vi } from 'vitest'

const testState = vi.hoisted(() => ({
  database: {
    select: vi.fn(),
    update: vi.fn(),
  },
  requireOwnerSession: vi.fn(),
  enqueueInitialSync: vi.fn(),
}))

vi.mock('../db', () => ({
  database: testState.database,
  serverConfig: { deploymentMode: 'self-hosted' },
}))

vi.mock('../auth/session', () => ({
  requireActiveOrganizationOwnerSession: testState.requireOwnerSession,
  requireActiveOrganizationManagerSession: vi.fn(),
  requireActiveOrganizationSession: vi.fn(),
}))

vi.mock('../queue', () => ({
  enqueueGenerateReplyDraftJobs: vi.fn(),
  enqueueInitialStoreConnectionSyncJobs: testState.enqueueInitialSync,
}))

import { storeConnectionsRoutes } from './store-connections'

const connectionId = '11111111-1111-4111-8111-111111111111'
const appId = '22222222-2222-4222-8222-222222222222'
const organizationId = 'organization-1'
const credentialRevision = new Date('2026-09-20T10:00:00.000Z')
const activationRevision = new Date('2026-09-20T11:00:00.000Z')

function connection(status: 'active' | 'disabled' = 'disabled') {
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
  return {
    updatedAt: credentialRevision,
    keyId: 'credential-key-id',
  }
}

function configureRouteHarness(
  options: {
    credential?: ReturnType<typeof credential> | null
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
    externalAppId: options.updatedExternalAppId === undefined ? existing.connection.externalAppId : options.updatedExternalAppId,
    externalStoreId: options.updatedExternalStoreId === undefined ? existing.connection.externalStoreId : options.updatedExternalStoreId,
    displayName: options.updatedDisplayName === undefined ? existing.connection.displayName : options.updatedDisplayName,
    updatedAt: activationRevision,
  }
  const latestSettledAt = options.latestSettledAt === undefined ? new Date('2026-09-20T12:00:00.000Z') : options.latestSettledAt
  const whereSelect = vi.fn().mockResolvedValue([existing])
  const selectChain = {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: whereSelect,
  }
  const settledSyncSelectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(latestSettledAt ? [{ startedAt: latestSettledAt }] : []),
  }
  const returning = vi.fn().mockResolvedValue([updated])
  const whereUpdate = vi.fn().mockReturnValue({ returning })
  const set = vi.fn().mockReturnValue({ where: whereUpdate })

  let selectCalls = 0
  testState.database.select.mockImplementation(() => {
    selectCalls += 1
    return selectCalls === 1 ? selectChain : settledSyncSelectChain
  })
  testState.database.update.mockReturnValue({ set })
  testState.requireOwnerSession.mockResolvedValue({ ok: true, session: { organizationId, role: 'owner', userId: 'user-1' } })
  testState.enqueueInitialSync.mockImplementation(async (input: { connections: unknown[] }) =>
    input.connections.length > 0
      ? {
          status: 'queued',
          queuedStoreConnectionIds: [connectionId],
          failedStoreConnectionIds: [],
        }
      : {
          status: 'not_requested',
          queuedStoreConnectionIds: [],
          failedStoreConnectionIds: [],
        },
  )

  return { existing, updated, set }
}

describe('Store Connection activation', () => {
  it('queues an initial sync with the activation revision for a verified disabled connection', async () => {
    const { set } = configureRouteHarness()

    const response = await storeConnectionsRoutes.request(`http://localhost/api/store-connections/${connectionId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    })

    expect(response.status).toBe(200)
    expect(set).toHaveBeenCalledWith({ status: 'active', updatedAt: expect.any(Date) })
    expect(testState.enqueueInitialSync).toHaveBeenCalledWith({
      organizationId,
      connections: [{ storeConnectionId: connectionId, revisionAt: activationRevision }],
    })
    expect(await response.json()).toMatchObject({
      id: connectionId,
      status: 'active',
      initialSync: {
        status: 'queued',
        queuedStoreConnectionIds: [connectionId],
      },
    })
  })

  it('does not claim an import was queued when activation has no verified credential', async () => {
    configureRouteHarness({ credential: null })

    const response = await storeConnectionsRoutes.request(`http://localhost/api/store-connections/${connectionId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    })

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

    const response = await storeConnectionsRoutes.request(`http://localhost/api/store-connections/${connectionId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      initialSync: {
        status: 'failed',
        failedStoreConnectionIds: [connectionId],
      },
    })
  })

  it.each([
    {
      kind: 'identifier',
      options: { existingStatus: 'active' as const, updatedExternalAppId: 'com.example.updated' },
      requestBody: { externalAppId: 'com.example.updated' },
    },
    {
      kind: 'activation',
      options: {},
      requestBody: { status: 'active' as const },
    },
  ])('retries an identical $kind PATCH after persistence succeeds but enqueue fails', async ({ options, requestBody }) => {
    const { existing, updated } = configureRouteHarness(options)
    const secondExisting = { connection: updated, credential: existing.credential }
    const connectionSelect = (row: typeof secondExisting) => ({
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([row]),
    })
    const settledSyncSelect = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    }
    let connectionSelectCalls = 0
    testState.database.select.mockImplementation(() => {
      connectionSelectCalls += 1
      if (connectionSelectCalls === 1) {
        return connectionSelect({ connection: existing.connection, credential: existing.credential })
      }
      if (connectionSelectCalls === 2) {
        return connectionSelect(secondExisting)
      }
      return settledSyncSelect
    })
    testState.enqueueInitialSync
      .mockResolvedValueOnce({ status: 'failed', queuedStoreConnectionIds: [], failedStoreConnectionIds: [connectionId] })
      .mockResolvedValueOnce({ status: 'queued', queuedStoreConnectionIds: [connectionId], failedStoreConnectionIds: [] })

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
    expect(testState.database.update).toHaveBeenCalledTimes(1)
  })

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
  ])('queues an initial sync when an active verified connection changes $field', async ({ field, value, options }) => {
    configureRouteHarness({ existingStatus: 'active', ...options })

    const response = await storeConnectionsRoutes.request(`http://localhost/api/store-connections/${connectionId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    })

    expect(response.status).toBe(200)
    expect(testState.enqueueInitialSync).toHaveBeenCalledWith({
      organizationId,
      connections: [{ storeConnectionId: connectionId, revisionAt: activationRevision }],
    })
    expect(await response.json()).toMatchObject({
      status: 'active',
      initialSync: { status: 'queued' },
    })
  })

  it('does not queue an identifier change when the connection has no credential', async () => {
    configureRouteHarness({ existingStatus: 'active', credential: null, updatedExternalAppId: 'com.example.updated' })

    const response = await storeConnectionsRoutes.request(`http://localhost/api/store-connections/${connectionId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ externalAppId: 'com.example.updated' }),
    })

    expect(response.status).toBe(200)
    expect(testState.enqueueInitialSync).toHaveBeenCalledWith({ organizationId, connections: [] })
    expect(await response.json()).toMatchObject({
      status: 'active',
      initialSync: { status: 'not_requested' },
    })
  })

  it('does not queue an identifier change when the connection stays disabled', async () => {
    configureRouteHarness({ existingStatus: 'disabled', updatedStatus: 'disabled', updatedExternalAppId: 'com.example.updated' })

    const response = await storeConnectionsRoutes.request(`http://localhost/api/store-connections/${connectionId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ externalAppId: 'com.example.updated' }),
    })

    expect(response.status).toBe(200)
    expect(testState.enqueueInitialSync).toHaveBeenCalledWith({ organizationId, connections: [] })
    expect(await response.json()).toMatchObject({ status: 'disabled', initialSync: { status: 'not_requested' } })
  })

  it('does not enqueue when the external identifiers are unchanged', async () => {
    configureRouteHarness({ existingStatus: 'active', updatedExternalAppId: 'com.example.app' })

    const response = await storeConnectionsRoutes.request(`http://localhost/api/store-connections/${connectionId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ externalAppId: 'com.example.app' }),
    })

    expect(response.status).toBe(200)
    expect(testState.enqueueInitialSync).not.toHaveBeenCalled()
    expect(await response.json()).not.toHaveProperty('initialSync')
  })

  it('keeps the sync revision stable for a display name change', async () => {
    const { existing, set } = configureRouteHarness({ existingStatus: 'active', updatedDisplayName: 'Renamed app' })

    const response = await storeConnectionsRoutes.request(`http://localhost/api/store-connections/${connectionId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: 'Renamed app' }),
    })

    expect(response.status).toBe(200)
    expect(set).toHaveBeenCalledWith({ displayName: 'Renamed app', updatedAt: existing.connection.updatedAt })
    expect(testState.enqueueInitialSync).not.toHaveBeenCalled()
  })
})
