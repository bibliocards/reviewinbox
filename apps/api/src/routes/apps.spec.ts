import { describe, expect, it, vi } from 'vitest'

const testState = vi.hoisted(() => ({
  database: {
    query: { apps: { findFirst: vi.fn() } },
    select: vi.fn(),
    transaction: vi.fn(),
  },
  requireManagerSession: vi.fn(),
  enqueueInitialSync: vi.fn(),
  verifyGoogleCredential: vi.fn(),
}))

vi.mock('../db', () => ({
  database: testState.database,
  serverConfig: { deploymentMode: 'self-hosted' },
}))

vi.mock('../auth/session', () => ({
  requireActiveOrganizationManagerSession: testState.requireManagerSession,
  requireActiveOrganizationOwnerSession: vi.fn(),
  requireActiveOrganizationSession: vi.fn(),
}))

vi.mock('../queue', () => ({
  enqueueGenerateReplyDraftJobs: vi.fn(),
  enqueueInitialStoreConnectionSyncJobs: testState.enqueueInitialSync,
}))

vi.mock('@reviewinbox/config', () => ({
  loadEncryptionConfig: () => ({ appEncryptionKey: Buffer.alloc(32).toString('base64') }),
}))

vi.mock('@reviewinbox/core', () => ({
  decodeStoreCredentialEncryptionKey: () => Buffer.alloc(32),
  decryptStoreCredential: () => '{}',
  encryptStoreCredential: () => ({
    ciphertext: 'ciphertext',
    nonce: 'nonce',
    authTag: 'auth-tag',
    algorithm: 'aes-256-gcm',
    version: 1,
    keyId: 'credential-key-id',
  }),
}))

vi.mock('@reviewinbox/reply-drafts', () => ({
  selectMissingReplyDraftReviews: vi.fn(),
}))

vi.mock('@reviewinbox/sync', () => ({
  verifyAppleStoreCredentialForApp: vi.fn(),
  verifyGooglePlayStoreCredentialForApp: testState.verifyGoogleCredential,
}))

import { apps, storeConnections } from '@reviewinbox/db'

import { appsRoutes } from './apps'

const appId = '11111111-1111-4111-8111-111111111111'
const connectionId = '22222222-2222-4222-8222-222222222222'
const organizationId = 'organization-1'
const credentialRevision = new Date('2026-09-20T10:00:00.000Z')
const identityRevision = new Date('2026-09-20T11:00:00.000Z')

const existingApp = {
  id: appId,
  organizationId,
  name: 'Old name',
  autoDraftEnabled: true,
  createdAt: new Date('2026-09-20T09:00:00.000Z'),
  updatedAt: new Date('2026-09-20T09:30:00.000Z'),
}

const existingConnection = {
  id: connectionId,
  organizationId,
  appId,
  provider: 'google_play' as const,
  status: 'active' as const,
  externalAppId: 'com.example.old',
  externalStoreId: null,
  displayName: null,
  createdAt: new Date('2026-09-20T09:00:00.000Z'),
  updatedAt: new Date('2026-09-20T09:30:00.000Z'),
}

const existingCredential = {
  storeConnectionId: connectionId,
  ciphertext: 'ciphertext',
  nonce: 'nonce',
  authTag: 'auth-tag',
  algorithm: 'aes-256-gcm',
  version: 1,
  keyId: 'credential-key-id',
  createdAt: new Date('2026-09-20T08:00:00.000Z'),
  updatedAt: credentialRevision,
}

function configureRouteHarness(
  options: {
    existingExternalAppId?: string
    existingStatus?: 'active' | 'disabled'
    updatedStatus?: 'active' | 'disabled'
    updatedExternalAppId?: string
    latestSettledAt?: Date | null
  } = {},
) {
  vi.clearAllMocks()

  const updatedApp = { ...existingApp, name: 'Renamed app', updatedAt: identityRevision }
  const configuredExistingConnection = {
    ...existingConnection,
    externalAppId: options.existingExternalAppId ?? existingConnection.externalAppId,
    status: options.existingStatus ?? existingConnection.status,
  }
  const updatedConnection = {
    ...configuredExistingConnection,
    externalAppId: options.updatedExternalAppId ?? 'com.example.new',
    status: options.updatedStatus ?? ('active' as const),
    updatedAt: identityRevision,
  }
  const connectionMetadata = { updatedAt: credentialRevision, keyId: existingCredential.keyId }
  const latestSettledAt = options.latestSettledAt === undefined ? new Date('2026-09-20T12:00:00.000Z') : options.latestSettledAt

  const appUpdateReturning = vi.fn().mockResolvedValue([updatedApp])
  const appUpdateWhere = vi.fn().mockReturnValue({ returning: appUpdateReturning })
  const appUpdateSet = vi.fn().mockReturnValue({ where: appUpdateWhere })
  const connectionUpdateReturning = vi.fn().mockResolvedValue([updatedConnection])
  const connectionUpdateWhere = vi.fn().mockReturnValue({ returning: connectionUpdateReturning })
  const connectionUpdateSet = vi.fn().mockReturnValue({ where: connectionUpdateWhere })
  const transactionUpdate = vi.fn().mockImplementation((table: unknown) => ({
    set: table === apps ? appUpdateSet : connectionUpdateSet,
  }))

  const transactionSelectWhere = vi.fn().mockResolvedValue([{ connection: updatedConnection, credential: connectionMetadata }])
  const transactionSelectChain = {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: transactionSelectWhere,
  }
  const connectionLookup = vi.fn().mockResolvedValue(configuredExistingConnection)
  const transaction = {
    update: transactionUpdate,
    query: { storeConnections: { findFirst: connectionLookup } },
    select: vi.fn().mockReturnValue(transactionSelectChain),
  }

  const databaseSelectWhere = vi.fn().mockResolvedValue([{ credential: existingCredential }])
  const databaseSelectChain = {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: databaseSelectWhere,
  }
  const settledSyncSelectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(latestSettledAt ? [{ startedAt: latestSettledAt }] : []),
  }

  testState.database.query.apps.findFirst.mockResolvedValue(existingApp)
  testState.database.select.mockImplementation((selection: Record<string, unknown>) =>
    'credential' in selection ? databaseSelectChain : settledSyncSelectChain,
  )
  testState.database.transaction.mockImplementation(async (callback: (value: unknown) => Promise<unknown>) => callback(transaction))
  testState.requireManagerSession.mockResolvedValue({
    ok: true,
    session: { organizationId, role: 'owner', userId: 'user-1' },
  })
  testState.verifyGoogleCredential.mockResolvedValue({ ok: true })
  testState.enqueueInitialSync.mockResolvedValue({
    status: 'queued',
    queuedStoreConnectionIds: [connectionId],
    failedStoreConnectionIds: [],
  })

  return { connectionLookup, transactionUpdate, updatedConnection }
}

describe('App Store Connection updates', () => {
  it('uses the connection revision when the external identifier changes without credential replacement', async () => {
    const { transactionUpdate } = configureRouteHarness()

    const response = await appsRoutes.request(`http://localhost/api/apps/${appId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        app: { name: 'Renamed app' },
        connections: { google: { packageName: 'com.example.new' } },
      }),
    })

    expect(response.status).toBe(200)
    expect(testState.enqueueInitialSync).toHaveBeenCalledWith({
      organizationId,
      connections: [{ storeConnectionId: connectionId, revisionAt: identityRevision }],
    })
    expect(await response.json()).toMatchObject({
      initialSync: { status: 'queued', queuedStoreConnectionIds: [connectionId] },
    })
    expect(testState.database.transaction).toHaveBeenCalledTimes(1)
    expect(transactionUpdate).toHaveBeenCalledWith(apps)
    expect(transactionUpdate).toHaveBeenCalledWith(storeConnections)
  })

  it.each([
    {
      kind: 'identifier',
      options: { existingStatus: 'active' as const, updatedExternalAppId: 'com.example.new', latestSettledAt: null },
      requestBody: { packageName: 'com.example.new' },
    },
    {
      kind: 'activation',
      options: { existingStatus: 'disabled' as const, updatedExternalAppId: 'com.example.old', latestSettledAt: null },
      requestBody: { packageName: 'com.example.old' },
    },
  ])('retries an identical $kind App PUT after persistence succeeds but enqueue fails', async ({ options, requestBody }) => {
    const { connectionLookup, transactionUpdate, updatedConnection } = configureRouteHarness(options)
    connectionLookup
      .mockReset()
      .mockResolvedValueOnce({
        ...existingConnection,
        externalAppId: options.existingStatus === 'disabled' ? 'com.example.old' : existingConnection.externalAppId,
        status: options.existingStatus ?? existingConnection.status,
      })
      .mockResolvedValueOnce(updatedConnection)
    testState.enqueueInitialSync
      .mockResolvedValueOnce({ status: 'failed', queuedStoreConnectionIds: [], failedStoreConnectionIds: [connectionId] })
      .mockResolvedValueOnce({ status: 'queued', queuedStoreConnectionIds: [connectionId], failedStoreConnectionIds: [] })

    const request = () =>
      appsRoutes.request(`http://localhost/api/apps/${appId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          app: { name: 'Renamed app' },
          connections: { google: requestBody },
        }),
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
      connections: [{ storeConnectionId: connectionId, revisionAt: identityRevision }],
    })
    expect(transactionUpdate.mock.calls.filter(([table]) => table === storeConnections)).toHaveLength(1)
  })

  it('does not request an initial sync when only the App is renamed', async () => {
    configureRouteHarness({ existingExternalAppId: 'com.example.new' })
    testState.enqueueInitialSync.mockResolvedValueOnce({
      status: 'not_requested',
      queuedStoreConnectionIds: [],
      failedStoreConnectionIds: [],
    })

    const response = await appsRoutes.request(`http://localhost/api/apps/${appId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        app: { name: 'Renamed app' },
        connections: { google: { packageName: 'com.example.new' } },
      }),
    })

    expect(response.status).toBe(200)
    expect(testState.enqueueInitialSync).toHaveBeenCalledWith({
      organizationId,
      connections: [],
    })
    expect(await response.json()).toMatchObject({ initialSync: { status: 'not_requested' } })
  })
})
