import { loadEncryptionConfig } from '@reviewinbox/config'
import { canCreateStoreConnection, getPlanDefinition } from '@reviewinbox/billing'
import {
  createStoreConnectionRequestSchema,
  listStoreConnectionsResponseSchema,
  putStoreCredentialRequestSchema,
  storeConnectionResponseSchema,
  storeCredentialResponseSchema,
  syncRunResponseSchema,
  updateStoreConnectionRequestSchema,
} from '@reviewinbox/contracts'
import { decodeStoreCredentialEncryptionKey, encryptStoreCredential } from '@reviewinbox/core'
import { apps, organization as organizationTable, storeConnections, storeCredentials } from '@reviewinbox/db'
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
import { enqueueGenerateReplyDraftJobs } from '../queue'

export const storeConnectionsRoutes = new Hono()

storeConnectionsRoutes.get('/api/apps/:appId/store-connections', async (context) => {
  const appResult = await requireScopedApp(context)
  if (!appResult.ok) {
    return appResult.response
  }

  const rows = await selectStoreConnectionsWithCredential(appResult.appId, appResult.organizationId)

  return context.json(
    listStoreConnectionsResponseSchema.parse({
      storeConnections: rows.map(toStoreConnectionResponse),
    }),
  )
})

storeConnectionsRoutes.post('/api/apps/:appId/store-connections', async (context) => {
  const appResult = await requireScopedApp(context, { requireOwner: true })
  if (!appResult.ok) {
    return appResult.response
  }

  const bodyResult = await parseJsonBody(context, createStoreConnectionRequestSchema)
  if (!bodyResult.ok) {
    return bodyResult.response
  }

  const storeConnectionLimitDecision = await canCreateStoreConnectionForOrganization(appResult.organizationId)
  if (!storeConnectionLimitDecision.allowed) {
    return context.json(
      { error: 'Organization Store Connection limit reached.', errorCode: storeConnectionLimitDecision.reason },
      403,
    )
  }

  const [created] = await database
    .insert(storeConnections)
    .values({
      organizationId: appResult.organizationId,
      appId: appResult.appId,
      provider: bodyResult.data.provider,
      status: bodyResult.data.status,
      externalAppId: bodyResult.data.externalAppId,
      externalStoreId: bodyResult.data.externalStoreId,
      displayName: bodyResult.data.displayName,
    })
    .returning()

  if (!created) {
    throw new Error('Store Connection creation did not return a row.')
  }

  return context.json(storeConnectionResponseSchema.parse(toStoreConnectionResponse({ connection: created })), 201)
})

storeConnectionsRoutes.patch('/api/store-connections/:storeConnectionId', async (context) => {
  const sessionResult = await requireActiveOrganizationOwnerSession(context)
  if (!sessionResult.ok) {
    return sessionResult.response
  }

  const storeConnectionIdResult = parseUuidParam(context, 'storeConnectionId', 'Store Connection')
  if (!storeConnectionIdResult.ok) {
    return storeConnectionIdResult.response
  }

  const existing = await selectScopedStoreConnection(storeConnectionIdResult.data, sessionResult.session.organizationId)
  if (!existing) {
    return context.json({ error: 'Store Connection not found.' }, 404)
  }

  const bodyResult = await parseJsonBody(context, updateStoreConnectionRequestSchema)
  if (!bodyResult.ok) {
    return bodyResult.response
  }

  const [updated] = await database
    .update(storeConnections)
    .set(bodyResult.data)
    .where(eq(storeConnections.id, existing.connection.id))
    .returning()

  if (!updated) {
    throw new Error('Store Connection update did not return a row.')
  }

  return context.json(
    storeConnectionResponseSchema.parse(toStoreConnectionResponse({ connection: updated, credential: existing.credential })),
  )
})

storeConnectionsRoutes.put('/api/store-connections/:storeConnectionId/credential', async (context) => {
  const sessionResult = await requireActiveOrganizationOwnerSession(context)
  if (!sessionResult.ok) {
    return sessionResult.response
  }

  const storeConnectionIdResult = parseUuidParam(context, 'storeConnectionId', 'Store Connection')
  if (!storeConnectionIdResult.ok) {
    return storeConnectionIdResult.response
  }

  const existing = await selectScopedStoreConnection(storeConnectionIdResult.data, sessionResult.session.organizationId)
  if (!existing) {
    return context.json({ error: 'Store Connection not found.' }, 404)
  }

  const bodyResult = await parseJsonBody(context, putStoreCredentialRequestSchema)
  if (!bodyResult.ok) {
    return bodyResult.response
  }

  if (existing.connection.provider === 'apple_app_store') {
    if (!existing.connection.externalAppId) {
      return context.json(
        {
          error: 'Apple Store Connection requires an app identifier before credential verification.',
          errorCode: 'apple_app_id_required_for_verification',
        },
        400,
      )
    }

    const verification = await verifyAppleStoreCredentialForApp({
      appStoreAppId: existing.connection.externalAppId,
      plaintext: bodyResult.data.plaintext,
    })
    if (!verification.ok) {
      return context.json({ error: verification.errorMessage, errorCode: verification.errorCode }, 400)
    }
  }
  if (existing.connection.provider === 'google_play') {
    if (!existing.connection.externalAppId) {
      return context.json(
        {
          error: 'Google Play Store Connection requires a package name before credential verification.',
          errorCode: 'google_package_name_required_for_verification',
        },
        400,
      )
    }

    const verification = await verifyGooglePlayStoreCredentialForApp({
      packageName: existing.connection.externalAppId,
      plaintext: bodyResult.data.plaintext,
    })
    if (!verification.ok) {
      return context.json({ error: verification.errorMessage, errorCode: verification.errorCode }, 400)
    }
  }

  const encryptionConfig = loadEncryptionConfig()
  const encrypted = encryptStoreCredential(bodyResult.data.plaintext, decodeStoreCredentialEncryptionKey(encryptionConfig.appEncryptionKey))

  const [credential] = await database
    .insert(storeCredentials)
    .values({
      storeConnectionId: existing.connection.id,
      ...encrypted,
    })
    .onConflictDoUpdate({
      target: storeCredentials.storeConnectionId,
      set: { ...encrypted, updatedAt: new Date() },
    })
    .returning({
      updatedAt: storeCredentials.updatedAt,
      keyId: storeCredentials.keyId,
    })

  if (!credential) {
    throw new Error('Store Credential replacement did not return a row.')
  }

  return context.json(
    storeCredentialResponseSchema.parse({
      storeConnectionId: existing.connection.id,
      credential: {
        hasCredential: true,
        updatedAt: credential.updatedAt.toISOString(),
        keyId: credential.keyId,
      },
    }),
  )
})

storeConnectionsRoutes.post('/api/store-connections/:storeConnectionId/sync-reviews', async (context) => {
  const sessionResult = await requireActiveOrganizationManagerSession(context)
  if (!sessionResult.ok) {
    return sessionResult.response
  }

  const storeConnectionIdResult = parseUuidParam(context, 'storeConnectionId', 'Store Connection')
  if (!storeConnectionIdResult.ok) {
    return storeConnectionIdResult.response
  }

  if (serverConfig.deploymentMode === 'cloud') {
    const organization = await database.query.organization.findFirst({
      columns: { planName: true },
      where: eq(organizationTable.id, sessionResult.session.organizationId),
    })

    if (!organization || !getPlanDefinition(organization.planName).allowManualSync) {
      return context.json({ error: 'Manual sync is not available on this plan.', errorCode: 'manual_sync_not_available' }, 403)
    }
  }

  try {
    const syncRun = await syncReviewsForStoreConnection({
      database,
      organizationId: sessionResult.session.organizationId,
      storeConnectionId: storeConnectionIdResult.data,
      deploymentMode: serverConfig.deploymentMode,
    })

    if (syncRun.status === 'succeeded' || syncRun.status === 'partial') {
      try {
        await enqueueGenerateReplyDraftJobs({
          organizationId: syncRun.organizationId,
          reviewIds: syncRun.newReviewIds,
        })
      } catch (error) {
        console.error('ReviewInbox draft job enqueue failed after successful sync', serializeErrorForLog(error))
      }
    }

    return context.json(syncRunResponseSchema.parse(syncRun), syncRun.status === 'failed' ? 422 : 200)
  } catch (error) {
    if (error instanceof SyncStoreConnectionNotFoundError) {
      return context.json({ error: 'Store Connection not found.' }, 404)
    }

    throw error
  }
})

storeConnectionsRoutes.delete('/api/store-connections/:storeConnectionId/credential', async (context) => {
  const sessionResult = await requireActiveOrganizationOwnerSession(context)
  if (!sessionResult.ok) {
    return sessionResult.response
  }

  const storeConnectionIdResult = parseUuidParam(context, 'storeConnectionId', 'Store Connection')
  if (!storeConnectionIdResult.ok) {
    return storeConnectionIdResult.response
  }

  const existing = await selectScopedStoreConnection(storeConnectionIdResult.data, sessionResult.session.organizationId)
  if (!existing) {
    return context.json({ error: 'Store Connection not found.' }, 404)
  }

  await database.delete(storeCredentials).where(eq(storeCredentials.storeConnectionId, existing.connection.id))

  return context.json(
    storeCredentialResponseSchema.parse({
      storeConnectionId: existing.connection.id,
      credential: {
        hasCredential: false,
        updatedAt: null,
        keyId: null,
      },
    }),
  )
})

type ScopedAppResult = { ok: true; appId: string; organizationId: string } | { ok: false; response: Response }

async function requireScopedApp(context: Context, options: { requireOwner?: boolean } = {}): Promise<ScopedAppResult> {
  const sessionResult = options.requireOwner
    ? await requireActiveOrganizationOwnerSession(context)
    : await requireActiveOrganizationSession(context)
  if (!sessionResult.ok) {
    return sessionResult
  }

  const appIdResult = parseUuidParam(context, 'appId', 'App')
  if (!appIdResult.ok) {
    return appIdResult
  }

  const app = await database.query.apps.findFirst({
    columns: { id: true },
    where: and(eq(apps.id, appIdResult.data), eq(apps.organizationId, sessionResult.session.organizationId)),
  })

  if (!app) {
    return { ok: false, response: context.json({ error: 'App not found.' }, 404) }
  }

  return { ok: true, appId: app.id, organizationId: sessionResult.session.organizationId }
}

async function selectStoreConnectionsWithCredential(appId: string, organizationId: string) {
  return database
    .select({ connection: storeConnections, credential: credentialMetadataSelection })
    .from(storeConnections)
    .leftJoin(storeCredentials, eq(storeCredentials.storeConnectionId, storeConnections.id))
    .where(and(eq(storeConnections.appId, appId), eq(storeConnections.organizationId, organizationId)))
    .orderBy(storeConnections.createdAt)
}

async function selectScopedStoreConnection(storeConnectionId: string, organizationId: string) {
  const [row] = await database
    .select({ connection: storeConnections, credential: credentialMetadataSelection })
    .from(storeConnections)
    .leftJoin(storeCredentials, eq(storeCredentials.storeConnectionId, storeConnections.id))
    .where(and(eq(storeConnections.id, storeConnectionId), eq(storeConnections.organizationId, organizationId)))

  return row
}

const credentialMetadataSelection = {
  updatedAt: storeCredentials.updatedAt,
  keyId: storeCredentials.keyId,
}

type StoreConnectionRow = typeof storeConnections.$inferSelect
type StoreCredentialMetadataRow = {
  updatedAt: Date | null
  keyId: string | null
} | null

function toStoreConnectionResponse(row: { connection: StoreConnectionRow; credential?: StoreCredentialMetadataRow }) {
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
      hasCredential: row.credential?.keyId != null,
      updatedAt: row.credential?.updatedAt?.toISOString() ?? null,
      keyId: row.credential?.keyId ?? null,
    },
  }
}

async function canCreateStoreConnectionForOrganization(organizationId: string) {
  const organization = await database.query.organization.findFirst({
    columns: { planName: true, billingOverrides: true },
    where: eq(organizationTable.id, organizationId),
  })
  if (!organization) {
    return { allowed: false as const, reason: 'store_connection_limit_reached' as const, remaining: 0 as const }
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
    storeConnectionCount?.count ?? 0,
  )
}

function serializeErrorForLog(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return { name: error.name, message: error.message }
  }

  return { name: 'UnknownError', message: 'Unknown draft enqueue error' }
}
