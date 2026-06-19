import { loadEncryptionConfig } from '@reviewinbox/config'
import {
  appResponseSchema,
  connectAppRequestSchema,
  connectAppResponseSchema,
  createAppRequestSchema,
  deleteAppResponseSchema,
  listAppsResponseSchema,
  updateAppRequestSchema,
  updateAppResponseSchema,
} from '@reviewinbox/contracts'
import {
  decodeStoreCredentialEncryptionKey,
  decryptStoreCredential,
  encryptStoreCredential,
  type EncryptedStoreCredential,
} from '@reviewinbox/core'
import { apps, storeConnections, storeCredentials } from '@reviewinbox/db'
import { verifyAppleStoreCredentialForApp, verifyGooglePlayStoreCredentialForApp } from '@reviewinbox/sync'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'

import {
  requireActiveOrganizationManagerSession,
  requireActiveOrganizationOwnerSession,
  requireActiveOrganizationSession,
} from '../auth/session'
import { database } from '../db'
import { parseJsonBody, parseUuidParam } from '../http/validation'

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
      apps: rows.map((app) => ({
        ...toAppResponse(app),
        storeConnections: connectionsByAppId.get(app.id) ?? [],
      })),
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

  const [created] = await database
    .insert(apps)
    .values({
      organizationId: sessionResult.session.organizationId,
      name: bodyResult.data.name,
    })
    .returning()

  if (!created) {
    throw new Error('App creation did not return a row.')
  }

  return context.json(appResponseSchema.parse(toAppResponse(created)), 201)
})

appsRoutes.post('/api/apps/connect', async (context) => {
  const sessionResult = await requireActiveOrganizationOwnerSession(context)
  if (!sessionResult.ok) {
    return sessionResult.response
  }

  const bodyResult = await parseJsonBody(context, connectAppRequestSchema)
  if (!bodyResult.ok) {
    return bodyResult.response
  }

  const connections = bodyResult.data.connections ?? {}
  if (connections.apple) {
    const plaintext = stringifyAppleCredential(connections.apple)
    const verification = await verifyAppleStoreCredentialForApp({
      appStoreAppId: connections.apple.appStoreAppId,
      plaintext,
    })
    if (!verification.ok) {
      return context.json({ error: verification.errorMessage, errorCode: verification.errorCode }, 400)
    }
  }
  if (connections.google) {
    const serviceAccountJsonResult = parseServiceAccountJson(connections.google.serviceAccountJson)
    if (!serviceAccountJsonResult.ok) {
      return context.json({ error: serviceAccountJsonResult.error, errorCode: serviceAccountJsonResult.errorCode }, 400)
    }

    const verification = await verifyGooglePlayStoreCredentialForApp({
      packageName: connections.google.packageName,
      plaintext: connections.google.serviceAccountJson,
    })
    if (!verification.ok) {
      return context.json({ error: verification.errorMessage, errorCode: verification.errorCode }, 400)
    }
  }

  const encryptionConfig = loadEncryptionConfig()
  const encryptionKey = decodeStoreCredentialEncryptionKey(encryptionConfig.appEncryptionKey)

  const result = await database.transaction(async (transaction) => {
    const [createdApp] = await transaction
      .insert(apps)
      .values({
        organizationId: sessionResult.session.organizationId,
        name: bodyResult.data.app.name,
      })
      .returning()

    if (!createdApp) {
      throw new Error('App creation did not return a row.')
    }

    const createdStoreConnections = []

    if (connections.apple) {
      const [connection] = await transaction
        .insert(storeConnections)
        .values({
          organizationId: sessionResult.session.organizationId,
          appId: createdApp.id,
          provider: 'apple_app_store',
          externalAppId: connections.apple.appStoreAppId,
          externalStoreId: connections.apple.issuerId,
          displayName: null,
        })
        .returning()

      if (!connection) {
        throw new Error('Apple Store Connection creation did not return a row.')
      }

      const encrypted = encryptStoreCredential(stringifyAppleCredential(connections.apple), encryptionKey)

      const [credential] = await transaction
        .insert(storeCredentials)
        .values({
          storeConnectionId: connection.id,
          ...encrypted,
        })
        .returning({
          updatedAt: storeCredentials.updatedAt,
          keyId: storeCredentials.keyId,
        })

      if (!credential) {
        throw new Error('Apple Store Credential creation did not return a row.')
      }

      createdStoreConnections.push(toStoreConnectionResponse(connection, credential))
    }

    if (connections.google) {
      const [connection] = await transaction
        .insert(storeConnections)
        .values({
          organizationId: sessionResult.session.organizationId,
          appId: createdApp.id,
          provider: 'google_play',
          externalAppId: connections.google.packageName,
          externalStoreId: null,
          displayName: null,
        })
        .returning()

      if (!connection) {
        throw new Error('Google Play Store Connection creation did not return a row.')
      }

      const encrypted = encryptStoreCredential(connections.google.serviceAccountJson, encryptionKey)
      const [credential] = await transaction
        .insert(storeCredentials)
        .values({
          storeConnectionId: connection.id,
          ...encrypted,
        })
        .returning({
          updatedAt: storeCredentials.updatedAt,
          keyId: storeCredentials.keyId,
        })

      if (!credential) {
        throw new Error('Google Play Store Credential creation did not return a row.')
      }

      createdStoreConnections.push(toStoreConnectionResponse(connection, credential))
    }

    return {
      app: toAppResponse(createdApp),
      storeConnections: createdStoreConnections,
    }
  })

  return context.json(connectAppResponseSchema.parse(result), 201)
})

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
    where: and(eq(apps.id, appIdResult.data), eq(apps.organizationId, sessionResult.session.organizationId)),
  })

  if (!row) {
    return context.json({ error: 'App not found.' }, 404)
  }

  return context.json(appResponseSchema.parse(toAppResponse(row)))
})

appsRoutes.put('/api/apps/:appId', async (context) => {
  const sessionResult = await requireActiveOrganizationSession(context)
  if (!sessionResult.ok) {
    return sessionResult.response
  }

  const appIdResult = parseUuidParam(context, 'appId', 'App')
  if (!appIdResult.ok) {
    return appIdResult.response
  }

  const existingApp = await database.query.apps.findFirst({
    where: and(eq(apps.id, appIdResult.data), eq(apps.organizationId, sessionResult.session.organizationId)),
  })

  if (!existingApp) {
    return context.json({ error: 'App not found.' }, 404)
  }

  const bodyResult = await parseJsonBody(context, updateAppRequestSchema)
  if (!bodyResult.ok) {
    return bodyResult.response
  }

  const connections = bodyResult.data.connections ?? {}
  if (connections.apple && Boolean(connections.apple.keyId) !== Boolean(connections.apple.privateKey)) {
    return context.json(
      {
        error: 'Apple Store Credential replacement requires both key id and private key.',
        errorCode: 'apple_credential_replacement_incomplete',
      },
      400,
    )
  }
  if (connections.google?.serviceAccountJson) {
    const serviceAccountJsonResult = parseServiceAccountJson(connections.google.serviceAccountJson)
    if (!serviceAccountJsonResult.ok) {
      return context.json({ error: serviceAccountJsonResult.error, errorCode: serviceAccountJsonResult.errorCode }, 400)
    }
  }

  const encryptionConfig = loadEncryptionConfig()
  const encryptionKey = decodeStoreCredentialEncryptionKey(encryptionConfig.appEncryptionKey)

  if (connections.apple) {
    const applePlaintextResult = await getAppleCredentialPlaintextForVerification({
      appId: existingApp.id,
      organizationId: sessionResult.session.organizationId,
      issuerId: connections.apple.issuerId,
      encryptionKey,
      ...(connections.apple.keyId !== undefined ? { keyId: connections.apple.keyId } : {}),
      ...(connections.apple.privateKey !== undefined ? { privateKey: connections.apple.privateKey } : {}),
    })
    if (!applePlaintextResult.ok) {
      return context.json({ error: applePlaintextResult.error, errorCode: applePlaintextResult.errorCode }, 400)
    }

    const verification = await verifyAppleStoreCredentialForApp({
      appStoreAppId: connections.apple.appStoreAppId,
      plaintext: applePlaintextResult.plaintext,
    })
    if (!verification.ok) {
      return context.json({ error: verification.errorMessage, errorCode: verification.errorCode }, 400)
    }
  }
  if (connections.google) {
    const googlePlaintextResult = await getGoogleCredentialPlaintextForVerification({
      appId: existingApp.id,
      organizationId: sessionResult.session.organizationId,
      encryptionKey,
      ...(connections.google.serviceAccountJson !== undefined ? { serviceAccountJson: connections.google.serviceAccountJson } : {}),
    })
    if (!googlePlaintextResult.ok) {
      return context.json({ error: googlePlaintextResult.error, errorCode: googlePlaintextResult.errorCode }, 400)
    }

    const verification = await verifyGooglePlayStoreCredentialForApp({
      packageName: connections.google.packageName,
      plaintext: googlePlaintextResult.plaintext,
    })
    if (!verification.ok) {
      return context.json({ error: verification.errorMessage, errorCode: verification.errorCode }, 400)
    }
  }

  const result = await database.transaction(async (transaction) => {
    const [updatedApp] = await transaction
      .update(apps)
      .set({ name: bodyResult.data.app.name })
      .where(and(eq(apps.id, existingApp.id), eq(apps.organizationId, sessionResult.session.organizationId)))
      .returning()

    if (!updatedApp) {
      throw new Error('App update did not return a row.')
    }

    if (connections.apple) {
      const connection = await upsertStoreConnection(transaction, {
        appId: updatedApp.id,
        organizationId: sessionResult.session.organizationId,
        provider: 'apple_app_store',
        externalAppId: connections.apple.appStoreAppId,
        externalStoreId: connections.apple.issuerId,
      })

      if (connections.apple.keyId && connections.apple.privateKey) {
        const encrypted = encryptStoreCredential(
          stringifyAppleCredential({
            issuerId: connections.apple.issuerId,
            keyId: connections.apple.keyId,
            privateKey: connections.apple.privateKey,
          }),
          encryptionKey,
        )
        await replaceStoreCredential(transaction, connection.id, encrypted)
      }
    }

    if (connections.google) {
      const connection = await upsertStoreConnection(transaction, {
        appId: updatedApp.id,
        organizationId: sessionResult.session.organizationId,
        provider: 'google_play',
        externalAppId: connections.google.packageName,
        externalStoreId: null,
      })

      if (connections.google.serviceAccountJson) {
        const encrypted = encryptStoreCredential(connections.google.serviceAccountJson, encryptionKey)
        await replaceStoreCredential(transaction, connection.id, encrypted)
      }
    }

    const connectionRows = await transaction
      .select({ connection: storeConnections, credential: credentialMetadataSelection })
      .from(storeConnections)
      .leftJoin(storeCredentials, eq(storeCredentials.storeConnectionId, storeConnections.id))
      .where(and(eq(storeConnections.appId, updatedApp.id), eq(storeConnections.organizationId, sessionResult.session.organizationId)))

    return {
      app: toAppResponse(updatedApp),
      storeConnections: connectionRows.map((row) => toStoreConnectionResponse(row.connection, row.credential)),
    }
  })

  return context.json(updateAppResponseSchema.parse(result))
})

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
    .where(and(eq(apps.id, appIdResult.data), eq(apps.organizationId, sessionResult.session.organizationId)))
    .returning({ id: apps.id })

  if (!deleted) {
    return context.json({ error: 'App not found.' }, 404)
  }

  return context.json(deleteAppResponseSchema.parse(deleted))
})

type AppRow = typeof apps.$inferSelect
type StoreConnectionRow = typeof storeConnections.$inferSelect
type StoreProvider = StoreConnectionRow['provider']
type StoreCredentialMetadataRow = {
  updatedAt: Date | null
  keyId: string | null
} | null

const credentialMetadataSelection = {
  updatedAt: storeCredentials.updatedAt,
  keyId: storeCredentials.keyId,
}

function toAppResponse(app: AppRow) {
  return {
    id: app.id,
    name: app.name,
    createdAt: app.createdAt.toISOString(),
    updatedAt: app.updatedAt.toISOString(),
  }
}

function toStoreConnectionResponse(connection: StoreConnectionRow, credential?: StoreCredentialMetadataRow) {
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
      hasCredential: credential?.keyId != null,
      updatedAt: credential?.updatedAt?.toISOString() ?? null,
      keyId: credential?.keyId ?? null,
    },
  }
}

async function upsertStoreConnection(
  transaction: Parameters<Parameters<typeof database.transaction>[0]>[0],
  input: {
    appId: string
    organizationId: string
    provider: StoreProvider
    externalAppId: string
    externalStoreId: string | null
  },
) {
  const existing = await transaction.query.storeConnections.findFirst({
    where: and(
      eq(storeConnections.appId, input.appId),
      eq(storeConnections.organizationId, input.organizationId),
      eq(storeConnections.provider, input.provider),
    ),
  })

  if (existing) {
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

    return updated
  }

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

  return created
}

async function replaceStoreCredential(
  transaction: Parameters<Parameters<typeof database.transaction>[0]>[0],
  storeConnectionId: string,
  encrypted: ReturnType<typeof encryptStoreCredential>,
) {
  await transaction.delete(storeCredentials).where(eq(storeCredentials.storeConnectionId, storeConnectionId))
  await transaction.insert(storeCredentials).values({
    storeConnectionId,
    ...encrypted,
  })
}

function parseServiceAccountJson(value: string): { ok: true } | { ok: false; error: string; errorCode: string } {
  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'Google Play Store Credential must be a JSON object.', errorCode: 'google_credential_not_object' }
    }

    return { ok: true }
  } catch {
    return { ok: false, error: 'Google Play Store Credential must be valid JSON.', errorCode: 'google_credential_invalid_json' }
  }
}

function stringifyAppleCredential(input: { issuerId: string; keyId: string; privateKey: string }) {
  return JSON.stringify({
    issuerId: input.issuerId,
    keyId: input.keyId,
    privateKey: input.privateKey,
  })
}

async function getAppleCredentialPlaintextForVerification(input: {
  appId: string
  organizationId: string
  issuerId: string
  keyId?: string
  privateKey?: string
  encryptionKey: Buffer
}): Promise<{ ok: true; plaintext: string } | { ok: false; error: string; errorCode: string }> {
  if (input.keyId && input.privateKey) {
    return {
      ok: true,
      plaintext: stringifyAppleCredential({
        issuerId: input.issuerId,
        keyId: input.keyId,
        privateKey: input.privateKey,
      }),
    }
  }

  const [existingApple] = await database
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

  if (!existingApple?.credential) {
    return {
      ok: false,
      error: 'Apple Store Credential is required before verifying this Store Connection.',
      errorCode: 'apple_credential_required_for_verification',
    }
  }
  if (existingApple.connection.externalStoreId !== input.issuerId) {
    return {
      ok: false,
      error: 'Apple issuer id changes require replacing the Store Credential.',
      errorCode: 'apple_issuer_change_requires_credential_replacement',
    }
  }

  return {
    ok: true,
    plaintext: decryptStoreCredential(toEncryptedStoreCredential(existingApple.credential), input.encryptionKey),
  }
}

function toEncryptedStoreCredential(row: typeof storeCredentials.$inferSelect): EncryptedStoreCredential {
  return {
    ciphertext: row.ciphertext,
    nonce: row.nonce,
    authTag: row.authTag,
    algorithm: row.algorithm as EncryptedStoreCredential['algorithm'],
    version: row.version as EncryptedStoreCredential['version'],
    keyId: row.keyId,
  }
}

async function getGoogleCredentialPlaintextForVerification(input: {
  appId: string
  organizationId: string
  serviceAccountJson?: string
  encryptionKey: Buffer
}): Promise<{ ok: true; plaintext: string } | { ok: false; error: string; errorCode: string }> {
  if (input.serviceAccountJson) {
    return { ok: true, plaintext: input.serviceAccountJson }
  }

  const [existingGoogle] = await database
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
    plaintext: decryptStoreCredential(toEncryptedStoreCredential(existingGoogle.credential), input.encryptionKey),
  }
}
