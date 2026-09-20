import { loadEncryptionConfig } from '@reviewinbox/config'
import {
  decodeStoreCredentialEncryptionKey,
  decryptStoreCredential,
  encryptStoreCredential,
} from '@reviewinbox/core'
import { apps, createDatabase, storeConnections, storeCredentials } from '@reviewinbox/db'
import {
  verifyAppleStoreCredentialForApp,
  verifyGooglePlayStoreCredentialForApp,
} from '@reviewinbox/sync'
import type { Context } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import { requireActiveOrganizationManagerSession } from '../auth/session'
import { enqueueInitialStoreConnectionSyncJobs } from '../queue'
import { replaceStoreCredential } from '../store-credential'
import { createAppUpdateRoutes, type AppUpdateRouteDependencies } from './apps'

const appId = '11111111-1111-4111-8111-111111111111'
const connectionId = '22222222-2222-4222-8222-222222222222'
const organizationId = 'organization-1'
const credentialRevision = new Date('2026-09-20T10:00:00.000Z')
const identityRevision = new Date('2026-09-20T11:00:00.000Z')
const testDatabase = createDatabase('postgres://apps-routes-test')

type AppRow = typeof apps.$inferSelect
type ConnectionRow = typeof storeConnections.$inferSelect
type CredentialMetadata = { updatedAt: Date; keyId: string }
type SelectConnectionRow = { connection: ConnectionRow; credential: CredentialMetadata }
type ConnectionSelectBuilder = {
  from: () => ConnectionSelectBuilder
  leftJoin: () => ConnectionSelectBuilder
  where: () => Promise<SelectConnectionRow[]>
}
type SettledSelectBuilder = {
  from: () => SettledSelectBuilder
  where: () => SettledSelectBuilder
  orderBy: () => SettledSelectBuilder
  limit: () => Promise<Array<{ startedAt: Date }>>
}
type TestSelectBuilder = ConnectionSelectBuilder | SettledSelectBuilder
type UpdateValues = {
  name?: string
  externalAppId?: string | null
  externalStoreId?: string | null
  status?: 'active' | 'disabled'
  updatedAt?: Date
}
type ReturningBuilder = { returning: () => Promise<Array<AppRow | ConnectionRow>> }
type WhereBuilder = { where: () => ReturningBuilder }
type SetBuilder = { set: (values: UpdateValues) => WhereBuilder }
type TestTransaction = {
  update: (table: typeof apps | typeof storeConnections) => SetBuilder
  query: { storeConnections: { findFirst: () => Promise<ConnectionRow | undefined> } }
  select: () => TestSelectBuilder
}

const existingApp: AppRow = {
  id: appId,
  organizationId,
  name: 'Old name',
  autoDraftEnabled: true,
  replyContext: 'Be concise.',
  defaultLanguage: 'en',
  mappedLanguages: ['fr'],
  createdAt: new Date('2026-09-20T09:00:00.000Z'),
  updatedAt: new Date('2026-09-20T09:30:00.000Z'),
}

const existingConnection: ConnectionRow = {
  id: connectionId,
  organizationId,
  appId,
  provider: 'google_play',
  status: 'active',
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

type SessionResult = Awaited<ReturnType<typeof requireActiveOrganizationManagerSession>>
const state = {
  findFirst: vi.fn<() => Promise<AppRow | undefined>>(),
  select: vi.fn<(selection: { credential?: typeof storeCredentials }) => TestSelectBuilder>(),
  requireManagerSession: vi.fn<(context: Context) => Promise<SessionResult>>(),
  enqueueInitialSync: vi.fn<typeof enqueueInitialStoreConnectionSyncJobs>(),
  verifyAppleCredential: vi.fn<typeof verifyAppleStoreCredentialForApp>(),
  verifyGoogleCredential: vi.fn<typeof verifyGooglePlayStoreCredentialForApp>(),
  loadEncryptionConfig: vi.fn<typeof loadEncryptionConfig>(),
  decodeStoreCredentialEncryptionKey: vi.fn<typeof decodeStoreCredentialEncryptionKey>(),
  decryptStoreCredential: vi.fn<typeof decryptStoreCredential>(),
  encryptStoreCredential: vi.fn<typeof encryptStoreCredential>(),
  replaceStoreCredential: vi.fn<typeof replaceStoreCredential>(),
}

function configureDatabase() {
  Object.defineProperty(testDatabase.query.apps, 'findFirst', {
    configurable: true,
    value: state.findFirst,
  })
  Object.defineProperty(testDatabase, 'select', { configurable: true, value: state.select })
}

function configureDefaults() {
  vi.resetAllMocks()
  state.findFirst.mockResolvedValue(existingApp)
  state.requireManagerSession.mockResolvedValue({
    ok: true,
    session: { organizationId, role: 'owner', userId: 'user-1' },
  })
  state.verifyAppleCredential.mockResolvedValue({ ok: true })
  state.verifyGoogleCredential.mockResolvedValue({ ok: true })
  state.loadEncryptionConfig.mockReturnValue({
    appEncryptionKey: Buffer.alloc(32).toString('base64'),
  })
  state.decodeStoreCredentialEncryptionKey.mockReturnValue(Buffer.alloc(32))
  state.decryptStoreCredential.mockReturnValue('{}')
  state.encryptStoreCredential.mockReturnValue({
    ciphertext: 'ciphertext',
    nonce: 'nonce',
    authTag: 'auth-tag',
    algorithm: 'aes-256-gcm',
    version: 1,
    keyId: 'credential-key-id',
  })
  state.enqueueInitialSync.mockResolvedValue({
    status: 'queued',
    queuedStoreConnectionIds: [connectionId],
    failedStoreConnectionIds: [],
  })
  configureDatabase()
}

function connectionSelect(rows: SelectConnectionRow[]) {
  const builder: ConnectionSelectBuilder = {
    from: () => builder,
    leftJoin: () => builder,
    where: () => Promise.resolve(rows),
  }
  return builder
}

function settledSelect(latestSettledAt: Date | null) {
  const builder: SettledSelectBuilder = {
    from: () => builder,
    where: () => builder,
    orderBy: () => builder,
    limit: () => Promise.resolve(latestSettledAt ? [{ startedAt: latestSettledAt }] : []),
  }
  return builder
}

function configureTransaction(
  existingConnectionForRequest: ConnectionRow,
  updatedConnection: ConnectionRow,
  updatedApp: AppRow,
) {
  const appReturning = () => Promise.resolve([updatedApp])
  const connectionReturning = () => Promise.resolve([updatedConnection])
  const appSet = (_values: UpdateValues): WhereBuilder => ({
    where: () => ({ returning: appReturning }),
  })
  const connectionSet = (_values: UpdateValues): WhereBuilder => ({
    where: () => ({ returning: connectionReturning }),
  })
  const update = vi.fn<(table: typeof apps | typeof storeConnections) => SetBuilder>((table) => ({
    set: table === apps ? appSet : connectionSet,
  }))
  const connectionLookup = vi
    .fn<() => Promise<ConnectionRow | undefined>>()
    .mockResolvedValue(existingConnectionForRequest)
  const transaction: TestTransaction = {
    update,
    query: { storeConnections: { findFirst: connectionLookup } },
    select: () =>
      connectionSelect([
        {
          connection: updatedConnection,
          credential: { updatedAt: credentialRevision, keyId: 'credential-key-id' },
        },
      ]),
  }
  Object.defineProperty(testDatabase, 'transaction', {
    configurable: true,
    value: <T>(callback: (executor: TestTransaction) => Promise<T>) => callback(transaction),
  })
  return { connectionLookup, update }
}

function createRouteHarness(
  options: {
    existingExternalAppId?: string
    existingStatus?: 'active' | 'disabled'
    updatedStatus?: 'active' | 'disabled'
    updatedExternalAppId?: string
    latestSettledAt?: Date | null
  } = {},
) {
  configureDefaults()
  const configuredConnection: ConnectionRow = {
    ...existingConnection,
    externalAppId: options.existingExternalAppId ?? existingConnection.externalAppId,
    status: options.existingStatus ?? existingConnection.status,
  }
  const updatedConnection: ConnectionRow = {
    ...configuredConnection,
    externalAppId: options.updatedExternalAppId ?? 'com.example.new',
    status: options.updatedStatus ?? 'active',
    updatedAt: identityRevision,
  }
  const updatedApp = { ...existingApp, name: 'Renamed app', updatedAt: identityRevision }
  const settledAt =
    options.latestSettledAt === undefined
      ? new Date('2026-09-20T12:00:00.000Z')
      : options.latestSettledAt
  const transactionState = configureTransaction(configuredConnection, updatedConnection, updatedApp)
  state.select.mockImplementation((selection) =>
    'credential' in selection
      ? connectionSelect([{ connection: configuredConnection, credential: existingCredential }])
      : settledSelect(settledAt),
  )
  const dependencies: AppUpdateRouteDependencies = {
    database: testDatabase,
    requireManagerSession: state.requireManagerSession,
    loadEncryptionConfig: state.loadEncryptionConfig,
    decodeStoreCredentialEncryptionKey: state.decodeStoreCredentialEncryptionKey,
    decryptStoreCredential: state.decryptStoreCredential,
    encryptStoreCredential: state.encryptStoreCredential,
    verifyAppleStoreCredentialForApp: state.verifyAppleCredential,
    verifyGooglePlayStoreCredentialForApp: state.verifyGoogleCredential,
    enqueueInitialStoreConnectionSyncJobs: state.enqueueInitialSync,
    replaceStoreCredential: state.replaceStoreCredential,
  }
  return {
    routes: createAppUpdateRoutes(dependencies),
    connectionLookup: transactionState.connectionLookup,
    transactionUpdate: transactionState.update,
    updatedConnection,
  }
}

function requestBody(packageName: string) {
  return JSON.stringify({ app: { name: 'Renamed app' }, connections: { google: { packageName } } })
}

function requestOptions(body: string) {
  return { method: 'PUT', headers: { 'content-type': 'application/json' }, body }
}

describe('App Store Connection updates', () => {
  it('uses the connection revision when the external identifier changes without credential replacement', async () => {
    const { routes, transactionUpdate } = createRouteHarness()
    const response = await routes.request(
      `http://localhost/api/apps/${appId}`,
      requestOptions(requestBody('com.example.new')),
    )
    expect(response.status).toBe(200)
    expect(state.enqueueInitialSync).toHaveBeenCalledWith({
      organizationId,
      connections: [{ storeConnectionId: connectionId, revisionAt: identityRevision }],
    })
    expect(await response.json()).toMatchObject({ initialSync: { status: 'queued' } })
    expect(transactionUpdate).toHaveBeenCalledWith(apps)
    expect(transactionUpdate).toHaveBeenCalledWith(storeConnections)
  })
})

describe('App Store Connection retries', () => {
  it.each([
    {
      kind: 'identifier',
      existingStatus: 'active' as const,
      existingExternalAppId: 'com.example.old',
      packageName: 'com.example.new',
    },
    {
      kind: 'activation',
      existingStatus: 'disabled' as const,
      existingExternalAppId: 'com.example.old',
      packageName: 'com.example.old',
    },
  ])(
    'retries an identical $kind App PUT after persistence succeeds but enqueue fails',
    async (scenario) => {
      const { routes, connectionLookup, transactionUpdate, updatedConnection } = createRouteHarness(
        { ...scenario, updatedExternalAppId: scenario.packageName, latestSettledAt: null },
      )
      connectionLookup
        .mockReset()
        .mockResolvedValueOnce({
          ...existingConnection,
          externalAppId: scenario.existingExternalAppId,
          status: scenario.existingStatus,
        })
        .mockResolvedValueOnce(updatedConnection)
      state.enqueueInitialSync
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
        routes.request(
          `http://localhost/api/apps/${appId}`,
          requestOptions(requestBody(scenario.packageName)),
        )
      const firstResponse = await request()
      const secondResponse = await request()
      expect(firstResponse.status).toBe(200)
      expect(await firstResponse.json()).toMatchObject({ initialSync: { status: 'failed' } })
      expect(secondResponse.status).toBe(200)
      expect(await secondResponse.json()).toMatchObject({ initialSync: { status: 'queued' } })
      expect(state.enqueueInitialSync).toHaveBeenCalledTimes(2)
      expect(
        transactionUpdate.mock.calls.filter(([table]) => table === storeConnections),
      ).toHaveLength(1)
    },
  )

  it('does not request an initial sync when only the App is renamed', async () => {
    const { routes } = createRouteHarness({ existingExternalAppId: 'com.example.new' })
    state.enqueueInitialSync.mockResolvedValueOnce({
      status: 'not_requested',
      queuedStoreConnectionIds: [],
      failedStoreConnectionIds: [],
    })
    const response = await routes.request(
      `http://localhost/api/apps/${appId}`,
      requestOptions(requestBody('com.example.new')),
    )
    expect(response.status).toBe(200)
    expect(state.enqueueInitialSync).toHaveBeenCalledWith({ organizationId, connections: [] })
    expect(await response.json()).toMatchObject({ initialSync: { status: 'not_requested' } })
  })
})
