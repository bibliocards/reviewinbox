import { canCreateApp, canCreateStoreConnection } from '@reviewinbox/billing'
import { loadEncryptionConfig } from '@reviewinbox/config'
import {
  appResponseSchema,
  connectAppRequestSchema,
  connectAppResponseSchema,
  createAppRequestSchema,
  deleteAppResponseSchema,
  listAppsResponseSchema,
  queueMissingReplyDraftsResponseSchema,
  updateAppRequestSchema,
  updateAppResponseSchema,
} from '@reviewinbox/contracts'
import type { ConnectAppRequest, UpdateAppRequest } from '@reviewinbox/contracts'
import {
  decodeStoreCredentialEncryptionKey,
  decryptStoreCredential,
  type EncryptedStoreCredential,
  encryptStoreCredential,
} from '@reviewinbox/core'
import {
  apps,
  organization as organizationTable,
  storeConnections,
  storeCredentials,
} from '@reviewinbox/db'
import { selectMissingReplyDraftReviews } from '@reviewinbox/reply-drafts'
import {
  verifyAppleStoreCredentialForApp,
  verifyGooglePlayStoreCredentialForApp,
} from '@reviewinbox/sync'
import { and, count, eq } from 'drizzle-orm'
import type { Context } from 'hono'
import { Hono } from 'hono'
import { z } from 'zod'

import {
  requireActiveOrganizationManagerSession,
  requireActiveOrganizationOwnerSession,
  requireActiveOrganizationSession,
} from '../auth/session'
import { database, serverConfig } from '../db'
import { parseJsonBody, parseUuidParam } from '../http/validation'
import {
  latestStoreConnectionSyncRevisionAt,
  selectLatestSettledStoreConnectionSyncStartedAt,
  shouldQueueInitialStoreConnectionSync,
} from '../initial-sync'
import { enqueueGenerateReplyDraftJobs, enqueueInitialStoreConnectionSyncJobs } from '../queue'
import { replaceStoreCredential } from '../store-credential'

export type AppUpdateRouteDependencies = {
  database: AppUpdateDatabase
  requireManagerSession: typeof requireActiveOrganizationManagerSession
  loadEncryptionConfig: typeof loadEncryptionConfig
  decodeStoreCredentialEncryptionKey: typeof decodeStoreCredentialEncryptionKey
  decryptStoreCredential: typeof decryptStoreCredential
  encryptStoreCredential: typeof encryptStoreCredential
  verifyAppleStoreCredentialForApp: typeof verifyAppleStoreCredentialForApp
  verifyGooglePlayStoreCredentialForApp: typeof verifyGooglePlayStoreCredentialForApp
  enqueueInitialStoreConnectionSyncJobs: typeof enqueueInitialStoreConnectionSyncJobs
  replaceStoreCredential: typeof replaceStoreCredential
}

export type AppUpdateDatabase = Pick<typeof database, 'query' | 'select' | 'transaction'>

const defaultAppUpdateRouteDependencies: AppUpdateRouteDependencies = {
  database,
  requireManagerSession: requireActiveOrganizationManagerSession,
  loadEncryptionConfig,
  decodeStoreCredentialEncryptionKey,
  decryptStoreCredential,
  encryptStoreCredential,
  verifyAppleStoreCredentialForApp,
  verifyGooglePlayStoreCredentialForApp,
  enqueueInitialStoreConnectionSyncJobs,
  replaceStoreCredential,
}

export const appsRoutes = new Hono()

appsRoutes.get('/api/apps', async (context) => {
  const sessionResult = await requireActiveOrganizationSession(context)
  if (!sessionResult.ok) {
    return sessionResult.response
  }

  const rows = await database.query.apps.findMany({
    where: eq(apps.organizationId, sessionResult.session.organizationId),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  })
  const connectionRows = await database
    .select({ connection: storeConnections, credential: credentialMetadataSelection })
    .from(storeConnections)
    .leftJoin(storeCredentials, eq(storeCredentials.storeConnectionId, storeConnections.id))
    .where(eq(storeConnections.organizationId, sessionResult.session.organizationId))

  const connectionsByAppId = new Map<string, ReturnType<typeof toStoreConnectionResponse>[]>()
  for (const row of connectionRows) {
    const appConnections = connectionsByAppId.get(row.connection.appId) ?? []
    appConnections.push(toStoreConnectionResponse(row.connection, row.credential))
    connectionsByAppId.set(row.connection.appId, appConnections)
  }

  return context.json(
    listAppsResponseSchema.parse({
      apps: rows.map((app) => toAppListItemResponse(app, connectionsByAppId.get(app.id) ?? [])),
    }),
  )
})

appsRoutes.post('/api/apps', async (context) => {
  const sessionResult = await requireActiveOrganizationOwnerSession(context)
  if (!sessionResult.ok) {
    return sessionResult.response
  }

  const bodyResult = await parseJsonBody(context, createAppRequestSchema)
  if (!bodyResult.ok) {
    return bodyResult.response
  }

  const appLimitDecision = await canCreateAppForOrganization(sessionResult.session.organizationId)
  if (!appLimitDecision.allowed) {
    return context.json(
      { error: 'Organization app limit reached.', errorCode: appLimitDecision.reason },
      403,
    )
  }

  const created = await insertApp(sessionResult.session.organizationId, bodyResult.data.name)

  return context.json(appResponseSchema.parse(toAppResponse(created)), 201)
})

async function insertApp(organizationId: string, name: string) {
  const [created] = await database.insert(apps).values({ organizationId, name }).returning()
  if (!created) {
    throw new Error('App creation did not return a row.')
  }
  return created
}

async function connectApp(context: Context) {
  const sessionResult = await requireActiveOrganizationOwnerSession(context)
  if (!sessionResult.ok) {
    return sessionResult.response
  }

  const bodyResult = await parseJsonBody(context, connectAppRequestSchema)
  if (!bodyResult.ok) {
    return bodyResult.response
  }

  const connections = bodyResult.data.connections ?? {}
  const validationError = await validateConnectRequest(
    context,
    sessionResult.session.organizationId,
    connections,
  )
  if (validationError) {
    return validationError
  }

  const result = await createConnectedApp({
    organizationId: sessionResult.session.organizationId,
    name: bodyResult.data.app.name,
    connections,
  })

  return context.json(connectAppResponseSchema.parse(result), 201)
}

appsRoutes.post('/api/apps/connect', (context) => connectApp(context))

type ConnectAppConnections = NonNullable<ConnectAppRequest['connections']>

async function validateConnectRequest(
  context: Context,
  organizationId: string,
  connections: ConnectAppConnections,
) {
  const appLimitDecision = await canCreateAppForOrganization(organizationId)
  if (!appLimitDecision.allowed) {
    return context.json(
      { error: 'Organization app limit reached.', errorCode: appLimitDecision.reason },
      403,
    )
  }

  const requestedCount =
    Number(connections.apple !== undefined) + Number(connections.google !== undefined)
  if (requestedCount > 0) {
    const storeLimitDecision = await canCreateStoreConnectionsForOrganization(
      organizationId,
      requestedCount,
    )
    if (!storeLimitDecision.allowed) {
      return context.json(
        {
          error: 'Organization Store Connection limit reached.',
          errorCode: storeLimitDecision.reason,
        },
        403,
      )
    }
  }

  return validateConnectCredentials(context, connections)
}

async function validateConnectCredentials(context: Context, connections: ConnectAppConnections) {
  const appleError = await validateAppleConnectCredential(context, connections.apple)
  if (appleError) {
    return appleError
  }

  if (connections.google === undefined) {
    return null
  }

  return validateGoogleConnectCredential(context, connections.google)
}

async function validateAppleConnectCredential(
  context: Context,
  apple: ConnectAppConnections['apple'],
) {
  if (apple === undefined) {
    return null
  }

  const verification = await verifyAppleStoreCredentialForApp({
    appStoreAppId: apple.appStoreAppId,
    plaintext: stringifyAppleCredential(apple),
  })
  return verification.ok
    ? null
    : context.json({ error: verification.errorMessage, errorCode: verification.errorCode }, 400)
}

async function validateGoogleConnectCredential(
  context: Context,
  google: NonNullable<ConnectAppConnections['google']>,
) {
  const serviceAccountJsonResult = parseServiceAccountJson(google.serviceAccountJson)
  if (!serviceAccountJsonResult.ok) {
    return context.json(
      { error: serviceAccountJsonResult.error, errorCode: serviceAccountJsonResult.errorCode },
      400,
    )
  }

  const verification = await verifyGooglePlayStoreCredentialForApp({
    packageName: google.packageName,
    plaintext: google.serviceAccountJson,
  })
  if (!verification.ok) {
    return context.json(
      { error: verification.errorMessage, errorCode: verification.errorCode },
      400,
    )
  }

  return null
}

async function createConnectedApp(input: {
  organizationId: string
  name: string
  connections: ConnectAppConnections
}) {
  const encryptionConfig = loadEncryptionConfig()
  const encryptionKey = decodeStoreCredentialEncryptionKey(encryptionConfig.appEncryptionKey)
  const result = await database.transaction((transaction) =>
    createConnectedAppInTransaction(transaction, { ...input, encryptionKey }),
  )
  const initialSync = await enqueueInitialStoreConnectionSyncJobs({
    organizationId: input.organizationId,
    connections: result.storeConnections.flatMap((connection) =>
      hasText(connection.credential.updatedAt)
        ? [{ storeConnectionId: connection.id, revisionAt: connection.credential.updatedAt }]
        : [],
    ),
  })
  return { ...result, initialSync }
}

async function createConnectedAppInTransaction(
  transaction: DatabaseTransaction,
  input: {
    organizationId: string
    name: string
    connections: ConnectAppConnections
    encryptionKey: Buffer
  },
) {
  const [createdApp] = await transaction
    .insert(apps)
    .values({ organizationId: input.organizationId, name: input.name })
    .returning()
  if (!createdApp) {
    throw new Error('App creation did not return a row.')
  }

  const createdStoreConnections = []
  if (input.connections.apple !== undefined) {
    createdStoreConnections.push(
      await createConnectedStoreConnection(transaction, {
        organizationId: input.organizationId,
        appId: createdApp.id,
        provider: 'apple_app_store',
        externalAppId: input.connections.apple.appStoreAppId,
        externalStoreId: input.connections.apple.issuerId,
        plaintext: stringifyAppleCredential(input.connections.apple),
        encryptionKey: input.encryptionKey,
      }),
    )
  }
  if (input.connections.google !== undefined) {
    createdStoreConnections.push(
      await createConnectedStoreConnection(transaction, {
        organizationId: input.organizationId,
        appId: createdApp.id,
        provider: 'google_play',
        externalAppId: input.connections.google.packageName,
        externalStoreId: null,
        plaintext: input.connections.google.serviceAccountJson,
        encryptionKey: input.encryptionKey,
      }),
    )
  }

  return { app: toAppResponse(createdApp), storeConnections: createdStoreConnections }
}

async function createConnectedStoreConnection(
  transaction: DatabaseTransaction,
  input: {
    organizationId: string
    appId: string
    provider: StoreProvider
    externalAppId: string
    externalStoreId: string | null
    plaintext: string
    encryptionKey: Buffer
  },
) {
  const [connection] = await transaction
    .insert(storeConnections)
    .values({
      organizationId: input.organizationId,
      appId: input.appId,
      provider: input.provider,
      externalAppId: input.externalAppId,
      externalStoreId: input.externalStoreId,
      displayName: null,
    })
    .returning()
  if (!connection) {
    throw new Error(`${input.provider} Store Connection creation did not return a row.`)
  }

  const encrypted = encryptStoreCredential(input.plaintext, input.encryptionKey)
  const [credential] = await transaction
    .insert(storeCredentials)
    .values({ storeConnectionId: connection.id, ...encrypted })
    .returning({ updatedAt: storeCredentials.updatedAt, keyId: storeCredentials.keyId })
  if (!credential) {
    throw new Error(`${input.provider} Store Credential creation did not return a row.`)
  }

  return toStoreConnectionResponse(connection, credential)
}

appsRoutes.get('/api/apps/:appId', async (context) => {
  const sessionResult = await requireActiveOrganizationSession(context)
  if (!sessionResult.ok) {
    return sessionResult.response
  }

  const appIdResult = parseUuidParam(context, 'appId', 'App')
  if (!appIdResult.ok) {
    return appIdResult.response
  }

  const row = await database.query.apps.findFirst({
    where: and(
      eq(apps.id, appIdResult.data),
      eq(apps.organizationId, sessionResult.session.organizationId),
    ),
  })

  if (!row) {
    return context.json({ error: 'App not found.' }, 404)
  }

  return context.json(appResponseSchema.parse(toAppResponse(row)))
})

async function updateApp(context: Context, dependencies: AppUpdateRouteDependencies) {
  const appResult = await loadManagerApp(context, dependencies)
  if (!appResult.ok) {
    return appResult.response
  }

  const bodyResult = await parseJsonBody(context, updateAppRequestSchema)
  if (!bodyResult.ok) {
    return bodyResult.response
  }

  const connections = bodyResult.data.connections ?? {}
  const preparation = await prepareAppUpdate({
    dependencies,
    context,
    appId: appResult.app.id,
    organizationId: appResult.organizationId,
    name: bodyResult.data.app.name,
    connections,
  })
  if (!preparation.ok) {
    return preparation.response
  }

  const result = await dependencies.database.transaction((transaction) =>
    updateAppInTransaction(transaction, preparation.input, dependencies),
  )

  return finishUpdatedApp(context, result, appResult.organizationId, dependencies)
}

async function loadManagerApp(
  context: Context,
  dependencies: AppUpdateRouteDependencies,
): Promise<{ ok: true; app: AppRow; organizationId: string } | { ok: false; response: Response }> {
  const sessionResult = await dependencies.requireManagerSession(context)
  if (!sessionResult.ok) {
    return sessionResult
  }
  const appIdResult = parseUuidParam(context, 'appId', 'App')
  if (!appIdResult.ok) {
    return appIdResult
  }
  const app = await dependencies.database.query.apps.findFirst({
    where: and(
      eq(apps.id, appIdResult.data),
      eq(apps.organizationId, sessionResult.session.organizationId),
    ),
  })
  if (!app) {
    return { ok: false, response: context.json({ error: 'App not found.' }, 404) }
  }
  return { ok: true, app, organizationId: sessionResult.session.organizationId }
}

appsRoutes.put('/api/apps/:appId', (context) =>
  updateApp(context, defaultAppUpdateRouteDependencies),
)

export function createAppUpdateRoutes(
  dependencies: AppUpdateRouteDependencies = defaultAppUpdateRouteDependencies,
) {
  const routes = new Hono()
  routes.put('/api/apps/:appId', (context) => updateApp(context, dependencies))
  return routes
}

type UpdateAppConnections = NonNullable<UpdateAppRequest['connections']>
type AppleCredentialVerificationInput = {
  appId: string
  organizationId: string
  issuerId: string
  keyId?: string | undefined
  privateKey?: string | undefined
  encryptionKey: Buffer
}
type GoogleCredentialVerificationInput = {
  appId: string
  organizationId: string
  serviceAccountJson?: string
  encryptionKey: Buffer
}

async function prepareAppUpdate(input: {
  dependencies: AppUpdateRouteDependencies
  context: Context
  appId: string
  organizationId: string
  name: string
  connections: UpdateAppConnections
}): Promise<{ ok: true; input: AppUpdateInput } | { ok: false; response: Response }> {
  const encryptionConfig = input.dependencies.loadEncryptionConfig()
  const encryptionKey = input.dependencies.decodeStoreCredentialEncryptionKey(
    encryptionConfig.appEncryptionKey,
  )
  const validationError = await validateUpdateAppCredentials({ ...input, encryptionKey })
  if (validationError) {
    return { ok: false, response: validationError }
  }
  return {
    ok: true,
    input: {
      appId: input.appId,
      organizationId: input.organizationId,
      name: input.name,
      connections: input.connections,
      encryptionKey,
    },
  }
}

async function finishUpdatedApp(
  context: Context,
  result: Awaited<ReturnType<typeof updateAppInTransaction>>,
  organizationId: string,
  dependencies: AppUpdateRouteDependencies,
) {
  const retryInitialSyncConnections = await selectRetryInitialSyncConnections(
    result.retryInitialSyncCandidates,
    organizationId,
    dependencies,
  )
  const initialSync = await dependencies.enqueueInitialStoreConnectionSyncJobs({
    organizationId,
    connections: [...result.initialSyncConnections, ...retryInitialSyncConnections],
  })
  return context.json(updateAppResponseSchema.parse({ ...result, initialSync }))
}

async function selectRetryInitialSyncConnections(
  candidates: Awaited<ReturnType<typeof updateAppInTransaction>>['retryInitialSyncCandidates'],
  organizationId: string,
  dependencies: AppUpdateRouteDependencies,
) {
  const decisions = await Promise.all(
    candidates.map(async (candidate) => {
      const latestSettledAt = await selectLatestSettledStoreConnectionSyncStartedAt(
        dependencies.database,
        { storeConnectionId: candidate.storeConnectionId, organizationId },
      )
      return shouldQueueInitialStoreConnectionSync({
        revisionAt: candidate.revisionAt,
        latestSettledAt,
      })
    }),
  )
  return candidates.filter((_candidate, index) => decisions[index] === true)
}

async function validateUpdateAppCredentials(input: {
  dependencies: AppUpdateRouteDependencies
  context: Context
  appId: string
  organizationId: string
  connections: UpdateAppConnections
  encryptionKey: Buffer
}) {
  const appleError = await validateUpdatedAppleCredential(input)
  if (appleError) {
    return appleError
  }
  return validateUpdatedGoogleCredential(input)
}

async function validateUpdatedAppleCredential(input: {
  dependencies: AppUpdateRouteDependencies
  context: Context
  appId: string
  organizationId: string
  connections: UpdateAppConnections
  encryptionKey: Buffer
}) {
  const apple = input.connections.apple
  if (apple === undefined) {
    return null
  }

  const plaintextResult = await getUpdatedAppleCredentialPlaintext(input, apple)
  if (!plaintextResult.ok) {
    return input.context.json(
      { error: plaintextResult.error, errorCode: plaintextResult.errorCode },
      400,
    )
  }

  const verification = await input.dependencies.verifyAppleStoreCredentialForApp({
    appStoreAppId: apple.appStoreAppId,
    plaintext: plaintextResult.plaintext,
  })
  return verification.ok
    ? null
    : input.context.json(
        { error: verification.errorMessage, errorCode: verification.errorCode },
        400,
      )
}

function getUpdatedAppleCredentialPlaintext(
  input: {
    dependencies: AppUpdateRouteDependencies
    appId: string
    organizationId: string
    encryptionKey: Buffer
  },
  apple: NonNullable<UpdateAppConnections['apple']>,
) {
  const hasKeyId = hasText(apple.keyId)
  const hasPrivateKey = hasText(apple.privateKey)
  if (hasKeyId !== hasPrivateKey) {
    return {
      ok: false as const,
      error: 'Apple Store Credential replacement requires both key id and private key.',
      errorCode: 'apple_credential_replacement_incomplete',
    }
  }

  const credentialInput: AppleCredentialVerificationInput = {
    appId: input.appId,
    organizationId: input.organizationId,
    issuerId: apple.issuerId,
    encryptionKey: input.encryptionKey,
  }
  if (hasKeyId && hasPrivateKey) {
    credentialInput.keyId = apple.keyId
    credentialInput.privateKey = apple.privateKey
  }
  return getAppleCredentialPlaintextForVerification(credentialInput, input.dependencies)
}

async function validateUpdatedGoogleCredential(input: {
  dependencies: AppUpdateRouteDependencies
  context: Context
  appId: string
  organizationId: string
  connections: UpdateAppConnections
  encryptionKey: Buffer
}) {
  const google = input.connections.google
  if (google === undefined) {
    return null
  }

  const plaintextResult = await getUpdatedGoogleCredentialPlaintext(input, google)
  if (!plaintextResult.ok) {
    return input.context.json(
      { error: plaintextResult.error, errorCode: plaintextResult.errorCode },
      400,
    )
  }

  const verification = await input.dependencies.verifyGooglePlayStoreCredentialForApp({
    packageName: google.packageName,
    plaintext: plaintextResult.plaintext,
  })
  return verification.ok
    ? null
    : input.context.json(
        { error: verification.errorMessage, errorCode: verification.errorCode },
        400,
      )
}

function getUpdatedGoogleCredentialPlaintext(
  input: {
    dependencies: AppUpdateRouteDependencies
    appId: string
    organizationId: string
    encryptionKey: Buffer
  },
  google: NonNullable<UpdateAppConnections['google']>,
) {
  if (hasText(google.serviceAccountJson)) {
    const serviceAccountJsonResult = parseServiceAccountJson(google.serviceAccountJson)
    if (!serviceAccountJsonResult.ok) {
      return serviceAccountJsonResult
    }
  }

  const credentialInput: GoogleCredentialVerificationInput = {
    appId: input.appId,
    organizationId: input.organizationId,
    encryptionKey: input.encryptionKey,
  }
  if (hasText(google.serviceAccountJson)) {
    credentialInput.serviceAccountJson = google.serviceAccountJson
  }
  return getGoogleCredentialPlaintextForVerification(credentialInput, input.dependencies)
}

type AppUpdateInput = {
  appId: string
  organizationId: string
  name: string
  connections: UpdateAppConnections
  encryptionKey: Buffer
}
type ConnectionUpdateState = {
  initialSyncConnectionIds: Set<string>
  credentialRevisionIds: Set<string>
  requestedStoreConnectionIds: Set<string>
}

async function updateAppInTransaction(
  transaction: DatabaseTransaction,
  input: AppUpdateInput,
  dependencies: AppUpdateRouteDependencies,
) {
  const updatedApp = await updateAppRow(transaction, input)
  const state = await updateRequestedStoreConnections(transaction, input, dependencies)
  const connectionRows = await selectAppStoreConnections(transaction, input)
  const initialSyncConnections = buildInitialSyncConnections(connectionRows, state)
  const retryInitialSyncCandidates = buildRetryInitialSyncCandidates(connectionRows, state)

  return {
    app: toAppResponse(updatedApp),
    storeConnections: connectionRows.map((row) =>
      toStoreConnectionResponse(row.connection, row.credential),
    ),
    initialSyncConnections,
    retryInitialSyncCandidates,
  }
}

async function updateAppRow(transaction: DatabaseTransaction, input: AppUpdateInput) {
  const [updatedApp] = await transaction
    .update(apps)
    .set({ name: input.name })
    .where(and(eq(apps.id, input.appId), eq(apps.organizationId, input.organizationId)))
    .returning()
  if (!updatedApp) {
    throw new Error('App update did not return a row.')
  }
  return updatedApp
}

async function updateRequestedStoreConnections(
  transaction: DatabaseTransaction,
  input: AppUpdateInput,
  dependencies: AppUpdateRouteDependencies,
): Promise<ConnectionUpdateState> {
  const state: ConnectionUpdateState = {
    initialSyncConnectionIds: new Set<string>(),
    credentialRevisionIds: new Set<string>(),
    requestedStoreConnectionIds: new Set<string>(),
  }
  if (input.connections.apple !== undefined) {
    await applyAppleStoreConnectionUpdate(transaction, input, state, dependencies)
  }
  if (input.connections.google !== undefined) {
    await applyGoogleStoreConnectionUpdate(transaction, input, state, dependencies)
  }
  return state
}

async function applyAppleStoreConnectionUpdate(
  transaction: DatabaseTransaction,
  input: AppUpdateInput,
  state: ConnectionUpdateState,
  dependencies: AppUpdateRouteDependencies,
) {
  const apple = input.connections.apple
  if (apple === undefined) {
    return
  }
  const upserted = await upsertStoreConnection(transaction, {
    appId: input.appId,
    organizationId: input.organizationId,
    provider: 'apple_app_store',
    externalAppId: apple.appStoreAppId,
    externalStoreId: apple.issuerId,
  })
  const plaintext =
    hasText(apple.keyId) && hasText(apple.privateKey)
      ? stringifyAppleCredential({
          issuerId: apple.issuerId,
          keyId: apple.keyId,
          privateKey: apple.privateKey,
        })
      : undefined
  await recordStoreConnectionUpdate(transaction, { input, upserted, plaintext, dependencies })
  state.requestedStoreConnectionIds.add(upserted.connection.id)
  if (hasText(apple.keyId) && hasText(apple.privateKey)) {
    state.credentialRevisionIds.add(upserted.connection.id)
  }
  addInitialSyncConnection(state, upserted)
}

async function applyGoogleStoreConnectionUpdate(
  transaction: DatabaseTransaction,
  input: AppUpdateInput,
  state: ConnectionUpdateState,
  dependencies: AppUpdateRouteDependencies,
) {
  const google = input.connections.google
  if (google === undefined) {
    return
  }
  const upserted = await upsertStoreConnection(transaction, {
    appId: input.appId,
    organizationId: input.organizationId,
    provider: 'google_play',
    externalAppId: google.packageName,
    externalStoreId: null,
  })
  await recordStoreConnectionUpdate(transaction, {
    input,
    upserted,
    plaintext: google.serviceAccountJson,
    dependencies,
  })
  state.requestedStoreConnectionIds.add(upserted.connection.id)
  if (hasText(google.serviceAccountJson)) {
    state.credentialRevisionIds.add(upserted.connection.id)
  }
  addInitialSyncConnection(state, upserted)
}

async function recordStoreConnectionUpdate(
  transaction: DatabaseTransaction,
  record: {
    input: AppUpdateInput
    upserted: Awaited<ReturnType<typeof upsertStoreConnection>>
    plaintext: string | undefined
    dependencies: AppUpdateRouteDependencies
  },
) {
  if (!hasText(record.plaintext)) {
    return
  }
  const encrypted = record.dependencies.encryptStoreCredential(
    record.plaintext,
    record.input.encryptionKey,
  )
  await record.dependencies.replaceStoreCredential(
    transaction,
    record.upserted.connection.id,
    encrypted,
  )
}

function addInitialSyncConnection(
  state: ConnectionUpdateState,
  upserted: Awaited<ReturnType<typeof upsertStoreConnection>>,
) {
  if (upserted.wasCreated || upserted.wasDisabled || upserted.identityChanged) {
    state.initialSyncConnectionIds.add(upserted.connection.id)
  }
}

function selectAppStoreConnections(transaction: DatabaseTransaction, input: AppUpdateInput) {
  return transaction
    .select({ connection: storeConnections, credential: credentialMetadataSelection })
    .from(storeConnections)
    .leftJoin(storeCredentials, eq(storeCredentials.storeConnectionId, storeConnections.id))
    .where(
      and(
        eq(storeConnections.appId, input.appId),
        eq(storeConnections.organizationId, input.organizationId),
      ),
    )
}

function buildInitialSyncConnections(
  rows: Array<{ connection: StoreConnectionRow; credential: StoreCredentialMetadataRow }>,
  state: ConnectionUpdateState,
) {
  return rows.flatMap((row) => {
    const credentialUpdatedAt = row.credential?.updatedAt
    const shouldSync =
      (state.initialSyncConnectionIds.has(row.connection.id)
        || state.credentialRevisionIds.has(row.connection.id))
      && row.connection.status === 'active'
      && credentialUpdatedAt !== null
      && credentialUpdatedAt !== undefined
    if (!shouldSync) {
      return []
    }
    return [
      {
        storeConnectionId: row.connection.id,
        revisionAt: latestStoreConnectionSyncRevisionAt({
          connectionUpdatedAt: row.connection.updatedAt,
          credentialUpdatedAt,
        }),
      },
    ]
  })
}

function buildRetryInitialSyncCandidates(
  rows: Array<{ connection: StoreConnectionRow; credential: StoreCredentialMetadataRow }>,
  state: ConnectionUpdateState,
) {
  return rows.flatMap((row) => {
    const credentialUpdatedAt = row.credential?.updatedAt
    const shouldRetry =
      state.requestedStoreConnectionIds.has(row.connection.id)
      && !state.initialSyncConnectionIds.has(row.connection.id)
      && !state.credentialRevisionIds.has(row.connection.id)
      && row.connection.status === 'active'
      && credentialUpdatedAt !== null
      && credentialUpdatedAt !== undefined
    if (!shouldRetry) {
      return []
    }
    return [
      {
        storeConnectionId: row.connection.id,
        revisionAt: latestStoreConnectionSyncRevisionAt({
          connectionUpdatedAt: row.connection.updatedAt,
          credentialUpdatedAt,
        }),
      },
    ]
  })
}

appsRoutes.delete('/api/apps/:appId', async (context) => {
  const sessionResult = await requireActiveOrganizationManagerSession(context)
  if (!sessionResult.ok) {
    return sessionResult.response
  }

  const appIdResult = parseUuidParam(context, 'appId', 'App')
  if (!appIdResult.ok) {
    return appIdResult.response
  }

  const [deleted] = await database
    .delete(apps)
    .where(
      and(
        eq(apps.id, appIdResult.data),
        eq(apps.organizationId, sessionResult.session.organizationId),
      ),
    )
    .returning({ id: apps.id })

  if (!deleted) {
    return context.json({ error: 'App not found.' }, 404)
  }

  return context.json(deleteAppResponseSchema.parse(deleted))
})

appsRoutes.post('/api/apps/:appId/reply-drafts/queue-missing', async (context) => {
  const sessionResult = await requireActiveOrganizationManagerSession(context)
  if (!sessionResult.ok) {
    return sessionResult.response
  }

  const appIdResult = parseUuidParam(context, 'appId', 'App')
  if (!appIdResult.ok) {
    return appIdResult.response
  }

  const selection = await selectMissingReplyDraftReviews({
    database,
    organizationId: sessionResult.session.organizationId,
    appId: appIdResult.data,
  })

  if (selection.status !== 'selected') {
    return queueMissingReplyDraftSelectionError(context, selection)
  }

  const queuedCount = await enqueueGenerateReplyDraftJobs({
    organizationId: sessionResult.session.organizationId,
    reviewIds: selection.reviewIds,
  })

  return context.json(
    queueMissingReplyDraftsResponseSchema.parse({
      queuedCount,
      skippedCount: selection.skippedCount + selection.reviewIds.length - queuedCount,
    }),
  )
})

function queueMissingReplyDraftSelectionError(
  context: Context,
  selection: Exclude<
    Awaited<ReturnType<typeof selectMissingReplyDraftReviews>>,
    { status: 'selected' }
  >,
): Response {
  if (selection.status === 'app_not_found') {
    return context.json({ error: 'App not found.' }, 404)
  }
  return context.json({ error: 'Enable auto-drafting before queueing missing Reply Drafts.' }, 409)
}

type AppRow = typeof apps.$inferSelect
type StoreConnectionRow = typeof storeConnections.$inferSelect
type StoreProvider = StoreConnectionRow['provider']
type StoreCredentialMetadataRow = { updatedAt: Date | null; keyId: string | null } | null

const credentialMetadataSelection = {
  updatedAt: storeCredentials.updatedAt,
  keyId: storeCredentials.keyId,
}

function toAppResponse(app: AppRow) {
  return {
    id: app.id,
    name: app.name,
    autoDraftEnabled: app.autoDraftEnabled,
    createdAt: app.createdAt.toISOString(),
    updatedAt: app.updatedAt.toISOString(),
  }
}

function toAppListItemResponse(
  app: AppRow,
  connections: ReturnType<typeof toStoreConnectionResponse>[],
) {
  return Object.assign(toAppResponse(app), { storeConnections: connections })
}

function toStoreConnectionResponse(
  connection: StoreConnectionRow,
  credential?: StoreCredentialMetadataRow,
) {
  return {
    id: connection.id,
    appId: connection.appId,
    provider: connection.provider,
    status: connection.status,
    externalAppId: connection.externalAppId,
    externalStoreId: connection.externalStoreId,
    displayName: connection.displayName,
    createdAt: connection.createdAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString(),
    credential: {
      hasCredential: credential?.keyId !== null && credential?.keyId !== undefined,
      updatedAt: credential?.updatedAt?.toISOString() ?? null,
      keyId: credential?.keyId ?? null,
    },
  }
}

async function canCreateAppForOrganization(organizationId: string) {
  const organization = await selectBillingOrganization(organizationId)
  if (!organization) {
    return { allowed: false as const, reason: 'app_limit_reached' as const, remaining: 0 as const }
  }

  const [appCount] = await database
    .select({ count: count() })
    .from(apps)
    .where(eq(apps.organizationId, organizationId))

  return canCreateApp(
    {
      deploymentMode: serverConfig.deploymentMode,
      planName: organization.planName,
      overrides: organization.billingOverrides,
    },
    appCount?.count ?? 0,
  )
}

async function canCreateStoreConnectionsForOrganization(
  organizationId: string,
  requestedCount: number,
) {
  const organization = await selectBillingOrganization(organizationId)
  if (!organization) {
    return {
      allowed: false as const,
      reason: 'store_connection_limit_reached' as const,
      remaining: 0 as const,
    }
  }

  const [storeConnectionCount] = await database
    .select({ count: count() })
    .from(storeConnections)
    .where(eq(storeConnections.organizationId, organizationId))

  return canCreateStoreConnection(
    {
      deploymentMode: serverConfig.deploymentMode,
      planName: organization.planName,
      overrides: organization.billingOverrides,
    },
    (storeConnectionCount?.count ?? 0) + requestedCount - 1,
  )
}

function selectBillingOrganization(organizationId: string) {
  return database.query.organization.findFirst({
    columns: { planName: true, billingOverrides: true },
    where: eq(organizationTable.id, organizationId),
  })
}

type DatabaseTransaction = Parameters<Parameters<typeof database.transaction>[0]>[0]
type UpsertStoreConnectionInput = {
  appId: string
  organizationId: string
  provider: StoreProvider
  externalAppId: string
  externalStoreId: string | null
}

async function upsertStoreConnection(
  transaction: DatabaseTransaction,
  input: UpsertStoreConnectionInput,
) {
  const existing = await transaction.query.storeConnections.findFirst({
    where: and(
      eq(storeConnections.appId, input.appId),
      eq(storeConnections.organizationId, input.organizationId),
      eq(storeConnections.provider, input.provider),
    ),
  })

  if (existing) {
    return updateExistingStoreConnection(transaction, existing, input)
  }

  return createStoreConnectionInTransaction(transaction, input)
}

async function updateExistingStoreConnection(
  transaction: DatabaseTransaction,
  existing: StoreConnectionRow,
  input: UpsertStoreConnectionInput,
) {
  const wasDisabled = existing.status === 'disabled'
  const identityChanged =
    existing.externalAppId !== input.externalAppId
    || existing.externalStoreId !== input.externalStoreId
  if (!wasDisabled && !identityChanged) {
    return { connection: existing, wasDisabled: false, identityChanged: false, wasCreated: false }
  }

  const [updated] = await transaction
    .update(storeConnections)
    .set({
      externalAppId: input.externalAppId,
      externalStoreId: input.externalStoreId,
      status: 'active',
    })
    .where(eq(storeConnections.id, existing.id))
    .returning()
  if (!updated) {
    throw new Error('Store Connection update did not return a row.')
  }
  return { connection: updated, wasDisabled, identityChanged, wasCreated: false }
}

async function createStoreConnectionInTransaction(
  transaction: DatabaseTransaction,
  input: UpsertStoreConnectionInput,
) {
  const [created] = await transaction
    .insert(storeConnections)
    .values({
      appId: input.appId,
      organizationId: input.organizationId,
      provider: input.provider,
      externalAppId: input.externalAppId,
      externalStoreId: input.externalStoreId,
      displayName: null,
    })
    .returning()

  if (!created) {
    throw new Error('Store Connection creation did not return a row.')
  }

  return { connection: created, wasDisabled: false, identityChanged: false, wasCreated: true }
}

function parseServiceAccountJson(
  value: string,
): { ok: true } | { ok: false; error: string; errorCode: string } {
  try {
    const parsed = z.looseObject({}).safeParse(JSON.parse(value))
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Google Play Store Credential must be a JSON object.',
        errorCode: 'google_credential_not_object',
      }
    }

    return { ok: true }
  } catch {
    return {
      ok: false,
      error: 'Google Play Store Credential must be valid JSON.',
      errorCode: 'google_credential_invalid_json',
    }
  }
}

function stringifyAppleCredential(input: { issuerId: string; keyId: string; privateKey: string }) {
  return JSON.stringify({
    issuerId: input.issuerId,
    keyId: input.keyId,
    privateKey: input.privateKey,
  })
}

async function getAppleCredentialPlaintextForVerification(
  input: AppleCredentialVerificationInput,
  dependencies: AppUpdateRouteDependencies,
): Promise<{ ok: true; plaintext: string } | { ok: false; error: string; errorCode: string }> {
  if (hasText(input.keyId) && hasText(input.privateKey)) {
    return {
      ok: true,
      plaintext: stringifyAppleCredential({
        issuerId: input.issuerId,
        keyId: input.keyId,
        privateKey: input.privateKey,
      }),
    }
  }

  const existingAppleResult = await findExistingAppleCredential(input, dependencies)
  if (!existingAppleResult.ok) {
    return existingAppleResult
  }

  return {
    ok: true,
    plaintext: dependencies.decryptStoreCredential(
      toEncryptedStoreCredential(existingAppleResult.credential),
      input.encryptionKey,
    ),
  }
}

async function findExistingAppleCredential(
  input: AppleCredentialVerificationInput,
  dependencies: AppUpdateRouteDependencies,
) {
  const [existingApple] = await dependencies.database
    .select({ connection: storeConnections, credential: storeCredentials })
    .from(storeConnections)
    .leftJoin(storeCredentials, eq(storeCredentials.storeConnectionId, storeConnections.id))
    .where(
      and(
        eq(storeConnections.appId, input.appId),
        eq(storeConnections.organizationId, input.organizationId),
        eq(storeConnections.provider, 'apple_app_store'),
      ),
    )

  const credential = existingApple?.credential
  if (!credential) {
    return {
      ok: false as const,
      error: 'Apple Store Credential is required before verifying this Store Connection.',
      errorCode: 'apple_credential_required_for_verification',
    }
  }
  if (existingApple.connection.externalStoreId !== input.issuerId) {
    return {
      ok: false as const,
      error: 'Apple issuer id changes require replacing the Store Credential.',
      errorCode: 'apple_issuer_change_requires_credential_replacement',
    }
  }

  return { ok: true as const, credential }
}

function toEncryptedStoreCredential(
  row: typeof storeCredentials.$inferSelect,
): EncryptedStoreCredential {
  if (row.algorithm !== 'aes-256-gcm' || row.version !== 1) {
    throw new Error('Unsupported Store Credential encryption metadata.')
  }

  return {
    ciphertext: row.ciphertext,
    nonce: row.nonce,
    authTag: row.authTag,
    algorithm: row.algorithm,
    version: row.version,
    keyId: row.keyId,
  }
}

async function getGoogleCredentialPlaintextForVerification(
  input: {
    appId: string
    organizationId: string
    serviceAccountJson?: string
    encryptionKey: Buffer
  },
  dependencies: AppUpdateRouteDependencies,
): Promise<{ ok: true; plaintext: string } | { ok: false; error: string; errorCode: string }> {
  if (hasText(input.serviceAccountJson)) {
    return { ok: true, plaintext: input.serviceAccountJson }
  }

  const [existingGoogle] = await dependencies.database
    .select({ credential: storeCredentials })
    .from(storeConnections)
    .leftJoin(storeCredentials, eq(storeCredentials.storeConnectionId, storeConnections.id))
    .where(
      and(
        eq(storeConnections.appId, input.appId),
        eq(storeConnections.organizationId, input.organizationId),
        eq(storeConnections.provider, 'google_play'),
      ),
    )

  if (!existingGoogle?.credential) {
    return {
      ok: false,
      error: 'Google Play Store Credential is required before verifying this Store Connection.',
      errorCode: 'google_credential_required_for_verification',
    }
  }

  return {
    ok: true,
    plaintext: dependencies.decryptStoreCredential(
      toEncryptedStoreCredential(existingGoogle.credential),
      input.encryptionKey,
    ),
  }
}

function hasText(value: string | null | undefined): value is string {
  return value !== null && value !== undefined && value !== ''
}
