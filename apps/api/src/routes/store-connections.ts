import { canCreateStoreConnection, getPlanDefinition } from '@reviewinbox/billing'
import { loadEncryptionConfig } from '@reviewinbox/config'
import type { ServerConfig } from '@reviewinbox/config'
import {
  createStoreConnectionRequestSchema,
  listStoreConnectionsResponseSchema,
  putStoreCredentialRequestSchema,
  storeConnectionResponseSchema,
  storeCredentialResponseSchema,
  syncRunResponseSchema,
  updateStoreConnectionRequestSchema,
} from '@reviewinbox/contracts'
import type {
  CreateStoreConnectionRequest,
  PutStoreCredentialRequest,
  UpdateStoreConnectionRequest,
} from '@reviewinbox/contracts'
import { decodeStoreCredentialEncryptionKey, encryptStoreCredential } from '@reviewinbox/core'
import {
  apps,
  organization as organizationTable,
  storeConnections,
  storeCredentials,
  type Database,
} from '@reviewinbox/db'
import {
  SyncStoreConnectionNotFoundError,
  syncReviewsForStoreConnection,
  verifyAppleStoreCredentialForApp,
  verifyGooglePlayStoreCredentialForApp,
} from '@reviewinbox/sync'
import { and, count, eq } from 'drizzle-orm'
import type { Context } from 'hono'
import { Hono } from 'hono'

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

export type StoreConnectionRouteDependencies = {
  database: Database
  serverConfig: Pick<ServerConfig, 'deploymentMode'>
  loadEncryptionConfig: typeof loadEncryptionConfig
  decodeStoreCredentialEncryptionKey: typeof decodeStoreCredentialEncryptionKey
  encryptStoreCredential: typeof encryptStoreCredential
  requireActiveOrganizationManagerSession: typeof requireActiveOrganizationManagerSession
  requireActiveOrganizationOwnerSession: typeof requireActiveOrganizationOwnerSession
  requireActiveOrganizationSession: typeof requireActiveOrganizationSession
  verifyAppleStoreCredentialForApp: typeof verifyAppleStoreCredentialForApp
  verifyGooglePlayStoreCredentialForApp: typeof verifyGooglePlayStoreCredentialForApp
  syncReviewsForStoreConnection: typeof syncReviewsForStoreConnection
  enqueueGenerateReplyDraftJobs: typeof enqueueGenerateReplyDraftJobs
  enqueueInitialStoreConnectionSyncJobs: typeof enqueueInitialStoreConnectionSyncJobs
}

const defaultDependencies: StoreConnectionRouteDependencies = {
  database,
  serverConfig,
  loadEncryptionConfig,
  decodeStoreCredentialEncryptionKey,
  encryptStoreCredential,
  requireActiveOrganizationManagerSession,
  requireActiveOrganizationOwnerSession,
  requireActiveOrganizationSession,
  verifyAppleStoreCredentialForApp,
  verifyGooglePlayStoreCredentialForApp,
  syncReviewsForStoreConnection,
  enqueueGenerateReplyDraftJobs,
  enqueueInitialStoreConnectionSyncJobs,
}

export function createStoreConnectionsRoutes(
  overrides: Partial<StoreConnectionRouteDependencies> = {},
): Hono {
  const dependencies: StoreConnectionRouteDependencies = { ...defaultDependencies, ...overrides }
  const routes = new Hono()
  registerListStoreConnectionsRoute(routes, dependencies)
  registerCreateStoreConnectionRoute(routes, dependencies)
  registerUpdateStoreConnectionRoute(routes, dependencies)
  registerPutStoreCredentialRoute(routes, dependencies)
  registerSyncStoreConnectionRoute(routes, dependencies)
  registerDeleteStoreCredentialRoute(routes, dependencies)
  return routes
}

export const storeConnectionsRoutes = createStoreConnectionsRoutes()

function registerListStoreConnectionsRoute(
  routes: Hono,
  dependencies: StoreConnectionRouteDependencies,
): void {
  routes.get('/api/apps/:appId/store-connections', async (context) => {
    const appResult = await requireScopedApp(context, dependencies)
    if (!appResult.ok) {
      return appResult.response
    }

    const rows = await selectStoreConnectionsWithCredential(
      appResult.appId,
      appResult.organizationId,
      dependencies,
    )

    return context.json(
      listStoreConnectionsResponseSchema.parse({
        storeConnections: rows.map((row) => toStoreConnectionResponse(row)),
      }),
    )
  })
}

function registerCreateStoreConnectionRoute(
  routes: Hono,
  dependencies: StoreConnectionRouteDependencies,
): void {
  routes.post('/api/apps/:appId/store-connections', (context) =>
    createStoreConnection(context, dependencies),
  )
}

function registerUpdateStoreConnectionRoute(
  routes: Hono,
  dependencies: StoreConnectionRouteDependencies,
): void {
  routes.patch('/api/store-connections/:storeConnectionId', (context) =>
    updateStoreConnection(context, dependencies),
  )
}

function registerPutStoreCredentialRoute(
  routes: Hono,
  dependencies: StoreConnectionRouteDependencies,
): void {
  routes.put('/api/store-connections/:storeConnectionId/credential', (context) =>
    putStoreCredential(context, dependencies),
  )
}

function registerSyncStoreConnectionRoute(
  routes: Hono,
  dependencies: StoreConnectionRouteDependencies,
): void {
  routes.post('/api/store-connections/:storeConnectionId/sync-reviews', (context) =>
    syncStoreConnection(context, dependencies),
  )
}

function registerDeleteStoreCredentialRoute(
  routes: Hono,
  dependencies: StoreConnectionRouteDependencies,
): void {
  routes.delete('/api/store-connections/:storeConnectionId/credential', async (context) => {
    const sessionResult = await dependencies.requireActiveOrganizationOwnerSession(context)
    if (!sessionResult.ok) {
      return sessionResult.response
    }

    const storeConnectionIdResult = parseUuidParam(context, 'storeConnectionId', 'Store Connection')
    if (!storeConnectionIdResult.ok) {
      return storeConnectionIdResult.response
    }

    const existing = await selectScopedStoreConnection(
      storeConnectionIdResult.data,
      sessionResult.session.organizationId,
      dependencies,
    )
    if (!existing) {
      return context.json({ error: 'Store Connection not found.' }, 404)
    }

    await dependencies.database
      .delete(storeCredentials)
      .where(eq(storeCredentials.storeConnectionId, existing.connection.id))

    return context.json(
      storeCredentialResponseSchema.parse({
        storeConnectionId: existing.connection.id,
        credential: { hasCredential: false, updatedAt: null, keyId: null },
      }),
    )
  })
}

type OwnerStoreConnectionResult =
  | { ok: true; session: { organizationId: string }; existing: StoreConnectionWithCredential }
  | { ok: false; response: Response }

async function requireOwnerStoreConnection(
  context: Context,
  dependencies: StoreConnectionRouteDependencies,
): Promise<OwnerStoreConnectionResult> {
  const sessionResult = await dependencies.requireActiveOrganizationOwnerSession(context)
  if (!sessionResult.ok) {
    return sessionResult
  }

  const idResult = parseUuidParam(context, 'storeConnectionId', 'Store Connection')
  if (!idResult.ok) {
    return idResult
  }

  const existing = await selectScopedStoreConnection(
    idResult.data,
    sessionResult.session.organizationId,
    dependencies,
  )
  if (!existing) {
    return { ok: false, response: context.json({ error: 'Store Connection not found.' }, 404) }
  }

  return { ok: true, session: sessionResult.session, existing }
}

async function putStoreCredential(
  context: Context,
  dependencies: StoreConnectionRouteDependencies,
) {
  const connectionResult = await requireOwnerStoreConnection(context, dependencies)
  if (!connectionResult.ok) {
    return connectionResult.response
  }

  const bodyResult = await parseJsonBody(context, putStoreCredentialRequestSchema)
  if (!bodyResult.ok) {
    return bodyResult.response
  }

  const verificationError = await verifyStoreCredential(
    connectionResult.existing.connection,
    bodyResult.data,
    dependencies,
  )
  if (verificationError) {
    return context.json(verificationError, 400)
  }

  const credential = await replaceStoreCredential(
    connectionResult.existing.connection.id,
    bodyResult.data,
    dependencies,
  )
  const initialSync = await dependencies.enqueueInitialStoreConnectionSyncJobs({
    organizationId: connectionResult.session.organizationId,
    connections:
      connectionResult.existing.connection.status === 'active'
        ? [
            {
              storeConnectionId: connectionResult.existing.connection.id,
              revisionAt: credential.updatedAt,
            },
          ]
        : [],
  })

  return context.json(
    storeCredentialResponseSchema.parse({
      storeConnectionId: connectionResult.existing.connection.id,
      credential: {
        hasCredential: true,
        updatedAt: credential.updatedAt.toISOString(),
        keyId: credential.keyId,
      },
      initialSync,
    }),
  )
}

async function verifyStoreCredential(
  connection: StoreConnectionRow,
  data: PutStoreCredentialRequest,
  dependencies: StoreConnectionRouteDependencies,
): Promise<{ error: string; errorCode: string } | null> {
  if (connection.provider === 'apple_app_store') {
    const result = await verifyAppleCredential(
      connection.externalAppId,
      data.plaintext,
      dependencies,
    )
    return result
  }

  if (connection.provider === 'google_play') {
    const result = await verifyGoogleCredential(
      connection.externalAppId,
      data.plaintext,
      dependencies,
    )
    return result
  }

  return null
}

async function verifyAppleCredential(
  externalAppId: string | null,
  plaintext: string,
  dependencies: StoreConnectionRouteDependencies,
): Promise<{ error: string; errorCode: string } | null> {
  if (externalAppId === null || externalAppId === undefined || externalAppId.length === 0) {
    return {
      error: 'Apple Store Connection requires an app identifier before credential verification.',
      errorCode: 'apple_app_id_required_for_verification',
    }
  }

  const verification = await dependencies.verifyAppleStoreCredentialForApp({
    appStoreAppId: externalAppId,
    plaintext,
  })
  return verification.ok
    ? null
    : { error: verification.errorMessage, errorCode: verification.errorCode }
}

async function verifyGoogleCredential(
  externalAppId: string | null,
  plaintext: string,
  dependencies: StoreConnectionRouteDependencies,
): Promise<{ error: string; errorCode: string } | null> {
  if (externalAppId === null || externalAppId === undefined || externalAppId.length === 0) {
    return {
      error: 'Google Play Store Connection requires a package name before credential verification.',
      errorCode: 'google_package_name_required_for_verification',
    }
  }

  const verification = await dependencies.verifyGooglePlayStoreCredentialForApp({
    packageName: externalAppId,
    plaintext,
  })
  return verification.ok
    ? null
    : { error: verification.errorMessage, errorCode: verification.errorCode }
}

async function replaceStoreCredential(
  storeConnectionId: string,
  data: PutStoreCredentialRequest,
  dependencies: StoreConnectionRouteDependencies,
) {
  const encryptionConfig = dependencies.loadEncryptionConfig()
  const encrypted = dependencies.encryptStoreCredential(
    data.plaintext,
    dependencies.decodeStoreCredentialEncryptionKey(encryptionConfig.appEncryptionKey),
  )
  const [credential] = await dependencies.database
    .insert(storeCredentials)
    .values({ storeConnectionId, ...encrypted })
    .onConflictDoUpdate({
      target: storeCredentials.storeConnectionId,
      set: { ...encrypted, updatedAt: new Date() },
    })
    .returning({ updatedAt: storeCredentials.updatedAt, keyId: storeCredentials.keyId })

  if (!credential) {
    throw new Error('Store Credential replacement did not return a row.')
  }

  return credential
}

async function syncStoreConnection(
  context: Context,
  dependencies: StoreConnectionRouteDependencies,
) {
  const request = await requireManualSyncRequest(context, dependencies)
  if (!request.ok) {
    return request.response
  }

  if (!request.manualSyncAvailable) {
    return context.json(
      {
        error: 'Manual sync is not available on this plan.',
        errorCode: 'manual_sync_not_available',
      },
      403,
    )
  }

  try {
    return await performManualSync(
      context,
      request.organizationId,
      request.storeConnectionId,
      dependencies,
    )
  } catch (error) {
    if (error instanceof SyncStoreConnectionNotFoundError) {
      return context.json({ error: 'Store Connection not found.' }, 404)
    }

    throw error
  }
}

async function requireManualSyncRequest(
  context: Context,
  dependencies: StoreConnectionRouteDependencies,
) {
  const sessionResult = await dependencies.requireActiveOrganizationManagerSession(context)
  if (!sessionResult.ok) {
    return sessionResult
  }

  const idResult = parseUuidParam(context, 'storeConnectionId', 'Store Connection')
  if (!idResult.ok) {
    return idResult
  }

  return {
    ok: true as const,
    organizationId: sessionResult.session.organizationId,
    storeConnectionId: idResult.data,
    manualSyncAvailable: await isManualSyncAvailable(
      sessionResult.session.organizationId,
      dependencies,
    ),
  }
}

async function performManualSync(
  context: Context,
  organizationId: string,
  storeConnectionId: string,
  dependencies: StoreConnectionRouteDependencies,
) {
  const syncRun = await dependencies.syncReviewsForStoreConnection({
    database: dependencies.database,
    organizationId,
    storeConnectionId,
    deploymentMode: dependencies.serverConfig.deploymentMode,
  })
  await enqueueDraftsAfterSuccessfulSync(syncRun, dependencies)
  return context.json(syncRunResponseSchema.parse(syncRun), syncRun.status === 'failed' ? 422 : 200)
}

async function isManualSyncAvailable(
  organizationId: string,
  dependencies: StoreConnectionRouteDependencies,
) {
  if (dependencies.serverConfig.deploymentMode !== 'cloud') {
    return true
  }

  const organization = await dependencies.database.query.organization.findFirst({
    columns: { planName: true },
    where: eq(organizationTable.id, organizationId),
  })
  if (organization === undefined) {
    return false
  }

  return getPlanDefinition(organization.planName).allowManualSync
}

async function enqueueDraftsAfterSuccessfulSync(
  syncRun: Awaited<ReturnType<typeof syncReviewsForStoreConnection>>,
  dependencies: StoreConnectionRouteDependencies,
) {
  if (syncRun.status !== 'succeeded' && syncRun.status !== 'partial') {
    return
  }

  try {
    await dependencies.enqueueGenerateReplyDraftJobs({
      organizationId: syncRun.organizationId,
      reviewIds: syncRun.newReviewIds,
    })
  } catch (error) {
    process.stderr.write(
      `ReviewInbox draft job enqueue failed after successful sync: ${JSON.stringify(serializeErrorForLog(error instanceof Error ? error : null))}\n`,
    )
  }
}

async function createStoreConnection(
  context: Context,
  dependencies: StoreConnectionRouteDependencies,
) {
  const appResult = await requireScopedApp(context, dependencies, { requireOwner: true })
  if (!appResult.ok) {
    return appResult.response
  }

  const bodyResult = await parseJsonBody(context, createStoreConnectionRequestSchema)
  if (!bodyResult.ok) {
    return bodyResult.response
  }

  const limitDecision = await canCreateStoreConnectionForOrganization(
    appResult.organizationId,
    dependencies,
  )
  if (!limitDecision.allowed) {
    return context.json(
      { error: 'Organization Store Connection limit reached.', errorCode: limitDecision.reason },
      403,
    )
  }

  const created = await insertStoreConnection(
    { appId: appResult.appId, organizationId: appResult.organizationId, data: bodyResult.data },
    dependencies,
  )

  return context.json(
    storeConnectionResponseSchema.parse(toStoreConnectionResponse({ connection: created })),
    201,
  )
}

async function insertStoreConnection(
  input: { appId: string; organizationId: string; data: CreateStoreConnectionRequest },
  dependencies: StoreConnectionRouteDependencies,
) {
  const [created] = await dependencies.database
    .insert(storeConnections)
    .values({
      organizationId: input.organizationId,
      appId: input.appId,
      provider: input.data.provider,
      status: input.data.status,
      externalAppId: input.data.externalAppId,
      externalStoreId: input.data.externalStoreId,
      displayName: input.data.displayName,
    })
    .returning()

  if (!created) {
    throw new Error('Store Connection creation did not return a row.')
  }

  return created
}

async function updateStoreConnection(
  context: Context,
  dependencies: StoreConnectionRouteDependencies,
) {
  const connectionResult = await requireOwnerStoreConnection(context, dependencies)
  if (!connectionResult.ok) {
    return connectionResult.response
  }

  const bodyResult = await parseJsonBody(context, updateStoreConnectionRequestSchema)
  if (!bodyResult.ok) {
    return bodyResult.response
  }

  const changedFields = collectChangedStoreConnectionFields(
    connectionResult.existing.connection,
    bodyResult.data,
  )
  const updated = await persistStoreConnectionUpdate(
    connectionResult.existing.connection,
    changedFields,
    dependencies,
  )
  const initialSync = await queueInitialSyncAfterUpdate(
    {
      organizationId: connectionResult.session.organizationId,
      existing: connectionResult.existing,
      updated,
      changedFields,
      requestedFields: bodyResult.data,
    },
    dependencies,
  )

  return context.json(
    storeConnectionResponseSchema.parse(
      addInitialSyncToResponse(
        toStoreConnectionResponse({
          connection: updated,
          credential: connectionResult.existing.credential,
        }),
        initialSync,
      ),
    ),
  )
}

type ChangedStoreConnectionFields = Partial<
  Pick<StoreConnectionRow, 'displayName' | 'externalAppId' | 'externalStoreId' | 'status'>
>

function collectChangedStoreConnectionFields(
  connection: StoreConnectionRow,
  requestedFields: UpdateStoreConnectionRequest,
): ChangedStoreConnectionFields {
  const changedFields: ChangedStoreConnectionFields = {}
  const fields: Array<keyof ChangedStoreConnectionFields> = [
    'displayName',
    'externalAppId',
    'externalStoreId',
    'status',
  ]

  for (const field of fields) {
    addChangedStoreConnectionField(changedFields, field, requestedFields[field], connection[field])
  }

  return changedFields
}

function addChangedStoreConnectionField<K extends keyof ChangedStoreConnectionFields>(
  changedFields: ChangedStoreConnectionFields,
  field: K,
  requested: ChangedStoreConnectionFields[K] | undefined,
  current: StoreConnectionRow[K],
) {
  if (requested !== undefined && requested !== current) {
    Object.assign(changedFields, { [field]: requested })
  }
}

async function persistStoreConnectionUpdate(
  connection: StoreConnectionRow,
  changedFields: ChangedStoreConnectionFields,
  dependencies: StoreConnectionRouteDependencies,
) {
  if (Object.keys(changedFields).length === 0) {
    return connection
  }

  const syncRevisionChanged =
    changedFields.status !== undefined
    || changedFields.externalAppId !== undefined
    || changedFields.externalStoreId !== undefined
  const [updated] = await dependencies.database
    .update(storeConnections)
    .set({ ...changedFields, updatedAt: syncRevisionChanged ? new Date() : connection.updatedAt })
    .where(eq(storeConnections.id, connection.id))
    .returning()

  if (!updated) {
    throw new Error('Store Connection update did not return a row.')
  }

  return updated
}

async function queueInitialSyncAfterUpdate(
  input: {
    organizationId: string
    existing: StoreConnectionWithCredential
    updated: StoreConnectionRow
    changedFields: ChangedStoreConnectionFields
    requestedFields: UpdateStoreConnectionRequest
  },
  dependencies: StoreConnectionRouteDependencies,
) {
  const decision = await getInitialSyncDecision(input, dependencies)
  if (!decision.shouldQueue) {
    return null
  }

  const hasCredential = hasStoreCredential(input.existing)
  const connections =
    input.updated.status === 'active' && hasCredential
      ? [{ storeConnectionId: input.existing.connection.id, revisionAt: decision.revisionAt }]
      : []

  return dependencies.enqueueInitialStoreConnectionSyncJobs({
    organizationId: input.organizationId,
    connections,
  })
}

async function getInitialSyncDecision(
  input: {
    organizationId: string
    existing: StoreConnectionWithCredential
    updated: StoreConnectionRow
    changedFields: ChangedStoreConnectionFields
    requestedFields: UpdateStoreConnectionRequest
  },
  dependencies: StoreConnectionRouteDependencies,
) {
  const revisionAt = latestStoreConnectionSyncRevisionAt({
    connectionUpdatedAt: input.updated.updatedAt,
    credentialUpdatedAt: input.existing.credential?.updatedAt,
  })
  const identicalSyncRelevantPatch = isIdenticalSyncRelevantPatch(
    input.changedFields,
    input.requestedFields,
  )
  const latestSettledAt = await getLatestSettledAtForPatch(
    {
      organizationId: input.organizationId,
      updated: input.updated,
      existing: input.existing,
      identicalSyncRelevantPatch,
    },
    dependencies,
  )
  const retryInitialSync = shouldRetryInitialSync({
    existing: input.existing,
    updated: input.updated,
    identicalSyncRelevantPatch,
    syncRevisionAt: revisionAt,
    latestSettledAt,
  })
  const isActivation =
    input.existing.connection.status === 'disabled' && input.changedFields.status === 'active'
  const identityChanged =
    input.changedFields.externalAppId !== undefined
    || input.changedFields.externalStoreId !== undefined

  return { revisionAt, shouldQueue: isActivation || identityChanged || retryInitialSync }
}

function hasStoreCredential(input: StoreConnectionWithCredential) {
  return input.credential?.updatedAt !== null && input.credential?.updatedAt !== undefined
}

function shouldRetryInitialSync(input: {
  existing: StoreConnectionWithCredential
  updated: StoreConnectionRow
  identicalSyncRelevantPatch: boolean
  syncRevisionAt: Date
  latestSettledAt: Date | null
}) {
  const hasCredential =
    input.existing.credential?.updatedAt !== null
    && input.existing.credential?.updatedAt !== undefined
  return (
    input.identicalSyncRelevantPatch
    && input.updated.status === 'active'
    && hasCredential
    && shouldQueueInitialStoreConnectionSync({
      revisionAt: input.syncRevisionAt,
      latestSettledAt: input.latestSettledAt,
    })
  )
}

function isIdenticalSyncRelevantPatch(
  changedFields: ChangedStoreConnectionFields,
  requestedFields: UpdateStoreConnectionRequest,
) {
  const hasChanges = Object.keys(changedFields).length > 0
  return (
    !hasChanges
    && (requestedFields.status !== undefined
      || requestedFields.externalAppId !== undefined
      || requestedFields.externalStoreId !== undefined)
  )
}

function getLatestSettledAtForPatch(
  input: {
    organizationId: string
    updated: StoreConnectionRow
    existing: StoreConnectionWithCredential
    identicalSyncRelevantPatch: boolean
  },
  dependencies: StoreConnectionRouteDependencies,
) {
  const hasCredential =
    input.existing.credential?.updatedAt !== null
    && input.existing.credential?.updatedAt !== undefined
  if (!input.identicalSyncRelevantPatch || input.updated.status !== 'active' || !hasCredential) {
    return null
  }

  return selectLatestSettledStoreConnectionSyncStartedAt(dependencies.database, {
    storeConnectionId: input.updated.id,
    organizationId: input.organizationId,
  })
}

function addInitialSyncToResponse<T extends object>(response: T, initialSync: InitialSync | null) {
  if (initialSync === null) {
    return response
  }

  return { ...response, initialSync }
}

type ScopedAppResult =
  | { ok: true; appId: string; organizationId: string }
  | { ok: false; response: Response }

async function requireScopedApp(
  context: Context,
  dependencies: StoreConnectionRouteDependencies,
  options: { requireOwner?: boolean } = {},
): Promise<ScopedAppResult> {
  const sessionResult =
    options.requireOwner === true
      ? await dependencies.requireActiveOrganizationOwnerSession(context)
      : await dependencies.requireActiveOrganizationSession(context)
  if (!sessionResult.ok) {
    return sessionResult
  }

  const appIdResult = parseUuidParam(context, 'appId', 'App')
  if (!appIdResult.ok) {
    return appIdResult
  }

  const app = await dependencies.database.query.apps.findFirst({
    columns: { id: true },
    where: and(
      eq(apps.id, appIdResult.data),
      eq(apps.organizationId, sessionResult.session.organizationId),
    ),
  })

  if (!app) {
    return { ok: false, response: context.json({ error: 'App not found.' }, 404) }
  }

  return { ok: true, appId: app.id, organizationId: sessionResult.session.organizationId }
}

function selectStoreConnectionsWithCredential(
  appId: string,
  organizationId: string,
  dependencies: StoreConnectionRouteDependencies,
) {
  return dependencies.database
    .select({ connection: storeConnections, credential: credentialMetadataSelection })
    .from(storeConnections)
    .leftJoin(storeCredentials, eq(storeCredentials.storeConnectionId, storeConnections.id))
    .where(
      and(eq(storeConnections.appId, appId), eq(storeConnections.organizationId, organizationId)),
    )
    .orderBy(storeConnections.createdAt)
}

async function selectScopedStoreConnection(
  storeConnectionId: string,
  organizationId: string,
  dependencies: StoreConnectionRouteDependencies,
) {
  const [row] = await dependencies.database
    .select({ connection: storeConnections, credential: credentialMetadataSelection })
    .from(storeConnections)
    .leftJoin(storeCredentials, eq(storeCredentials.storeConnectionId, storeConnections.id))
    .where(
      and(
        eq(storeConnections.id, storeConnectionId),
        eq(storeConnections.organizationId, organizationId),
      ),
    )

  return row
}

const credentialMetadataSelection = {
  updatedAt: storeCredentials.updatedAt,
  keyId: storeCredentials.keyId,
}

type StoreConnectionRow = typeof storeConnections.$inferSelect
type StoreCredentialMetadataRow = { updatedAt: Date | null; keyId: string | null } | null
type StoreConnectionWithCredential = {
  connection: StoreConnectionRow
  credential: StoreCredentialMetadataRow
}
type InitialSync = Awaited<ReturnType<typeof enqueueInitialStoreConnectionSyncJobs>>

function toStoreConnectionResponse(row: {
  connection: StoreConnectionRow
  credential?: StoreCredentialMetadataRow
}) {
  return {
    id: row.connection.id,
    appId: row.connection.appId,
    provider: row.connection.provider,
    status: row.connection.status,
    externalAppId: row.connection.externalAppId,
    externalStoreId: row.connection.externalStoreId,
    displayName: row.connection.displayName,
    createdAt: row.connection.createdAt.toISOString(),
    updatedAt: row.connection.updatedAt.toISOString(),
    credential: {
      hasCredential: row.credential?.keyId !== null && row.credential?.keyId !== undefined,
      updatedAt: row.credential?.updatedAt?.toISOString() ?? null,
      keyId: row.credential?.keyId ?? null,
    },
  }
}

async function canCreateStoreConnectionForOrganization(
  organizationId: string,
  dependencies: StoreConnectionRouteDependencies,
) {
  const organization = await dependencies.database.query.organization.findFirst({
    columns: { planName: true, billingOverrides: true },
    where: eq(organizationTable.id, organizationId),
  })
  if (!organization) {
    return {
      allowed: false as const,
      reason: 'store_connection_limit_reached' as const,
      remaining: 0 as const,
    }
  }

  const [storeConnectionCount] = await dependencies.database
    .select({ count: count() })
    .from(storeConnections)
    .where(eq(storeConnections.organizationId, organizationId))

  return canCreateStoreConnection(
    {
      deploymentMode: dependencies.serverConfig.deploymentMode,
      planName: organization.planName,
      overrides: organization.billingOverrides,
    },
    storeConnectionCount?.count ?? 0,
  )
}

function serializeErrorForLog(error: Error | null) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message }
  }

  return { name: 'UnknownError', message: 'Unknown draft enqueue error' }
}
