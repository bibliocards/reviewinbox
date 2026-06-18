import { loadEncryptionConfig } from "@reviewinbox/config"
import {
  createStoreConnectionRequestSchema,
  listStoreConnectionsResponseSchema,
  putStoreCredentialRequestSchema,
  storeConnectionResponseSchema,
  storeCredentialResponseSchema,
  updateStoreConnectionRequestSchema,
} from "@reviewinbox/contracts"
import { decodeStoreCredentialEncryptionKey, encryptStoreCredential } from "@reviewinbox/core"
import { apps, storeConnections, storeCredentials } from "@reviewinbox/db"
import { and, eq } from "drizzle-orm"
import { Hono } from "hono"
import type { Context } from "hono"

import {
  requireActiveOrganizationOwnerSession,
  requireActiveOrganizationSession,
} from "../auth/session"
import { database } from "../db"
import { parseJsonBody, parseUuidParam } from "../http/validation"

export const storeConnectionsRoutes = new Hono()

storeConnectionsRoutes.get("/api/apps/:appId/store-connections", async (context) => {
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

storeConnectionsRoutes.post("/api/apps/:appId/store-connections", async (context) => {
  const appResult = await requireScopedApp(context, { requireOwner: true })
  if (!appResult.ok) {
    return appResult.response
  }

  const bodyResult = await parseJsonBody(context, createStoreConnectionRequestSchema)
  if (!bodyResult.ok) {
    return bodyResult.response
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
    throw new Error("Store Connection creation did not return a row.")
  }

  return context.json(
    storeConnectionResponseSchema.parse(toStoreConnectionResponse({ connection: created })),
    201,
  )
})

storeConnectionsRoutes.patch("/api/store-connections/:storeConnectionId", async (context) => {
  const sessionResult = await requireActiveOrganizationOwnerSession(context)
  if (!sessionResult.ok) {
    return sessionResult.response
  }

  const storeConnectionIdResult = parseUuidParam(context, "storeConnectionId", "Store Connection")
  if (!storeConnectionIdResult.ok) {
    return storeConnectionIdResult.response
  }

  const existing = await selectScopedStoreConnection(
    storeConnectionIdResult.data,
    sessionResult.session.organizationId,
  )
  if (!existing) {
    return context.json({ error: "Store Connection not found." }, 404)
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
    throw new Error("Store Connection update did not return a row.")
  }

  return context.json(
    storeConnectionResponseSchema.parse(
      toStoreConnectionResponse({ connection: updated, credential: existing.credential }),
    ),
  )
})

storeConnectionsRoutes.put(
  "/api/store-connections/:storeConnectionId/credential",
  async (context) => {
    const sessionResult = await requireActiveOrganizationOwnerSession(context)
    if (!sessionResult.ok) {
      return sessionResult.response
    }

    const storeConnectionIdResult = parseUuidParam(context, "storeConnectionId", "Store Connection")
    if (!storeConnectionIdResult.ok) {
      return storeConnectionIdResult.response
    }

    const existing = await selectScopedStoreConnection(
      storeConnectionIdResult.data,
      sessionResult.session.organizationId,
    )
    if (!existing) {
      return context.json({ error: "Store Connection not found." }, 404)
    }

    const bodyResult = await parseJsonBody(context, putStoreCredentialRequestSchema)
    if (!bodyResult.ok) {
      return bodyResult.response
    }

    const encryptionConfig = loadEncryptionConfig()
    const encrypted = encryptStoreCredential(
      bodyResult.data.plaintext,
      decodeStoreCredentialEncryptionKey(encryptionConfig.appEncryptionKey),
    )

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
      throw new Error("Store Credential replacement did not return a row.")
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
  },
)

storeConnectionsRoutes.delete(
  "/api/store-connections/:storeConnectionId/credential",
  async (context) => {
    const sessionResult = await requireActiveOrganizationOwnerSession(context)
    if (!sessionResult.ok) {
      return sessionResult.response
    }

    const storeConnectionIdResult = parseUuidParam(context, "storeConnectionId", "Store Connection")
    if (!storeConnectionIdResult.ok) {
      return storeConnectionIdResult.response
    }

    const existing = await selectScopedStoreConnection(
      storeConnectionIdResult.data,
      sessionResult.session.organizationId,
    )
    if (!existing) {
      return context.json({ error: "Store Connection not found." }, 404)
    }

    await database
      .delete(storeCredentials)
      .where(eq(storeCredentials.storeConnectionId, existing.connection.id))

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
  },
)

type ScopedAppResult =
  | { ok: true; appId: string; organizationId: string }
  | { ok: false; response: Response }

async function requireScopedApp(
  context: Context,
  options: { requireOwner?: boolean } = {},
): Promise<ScopedAppResult> {
  const sessionResult = options.requireOwner
    ? await requireActiveOrganizationOwnerSession(context)
    : await requireActiveOrganizationSession(context)
  if (!sessionResult.ok) {
    return sessionResult
  }

  const appIdResult = parseUuidParam(context, "appId", "App")
  if (!appIdResult.ok) {
    return appIdResult
  }

  const app = await database.query.apps.findFirst({
    columns: { id: true },
    where: and(
      eq(apps.id, appIdResult.data),
      eq(apps.organizationId, sessionResult.session.organizationId),
    ),
  })

  if (!app) {
    return { ok: false, response: context.json({ error: "App not found." }, 404) }
  }

  return { ok: true, appId: app.id, organizationId: sessionResult.session.organizationId }
}

async function selectStoreConnectionsWithCredential(appId: string, organizationId: string) {
  return database
    .select({ connection: storeConnections, credential: credentialMetadataSelection })
    .from(storeConnections)
    .leftJoin(storeCredentials, eq(storeCredentials.storeConnectionId, storeConnections.id))
    .where(
      and(eq(storeConnections.appId, appId), eq(storeConnections.organizationId, organizationId)),
    )
    .orderBy(storeConnections.createdAt)
}

async function selectScopedStoreConnection(storeConnectionId: string, organizationId: string) {
  const [row] = await database
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
type StoreCredentialMetadataRow = {
  updatedAt: Date | null
  keyId: string | null
} | null

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
      hasCredential: row.credential?.keyId != null,
      updatedAt: row.credential?.updatedAt?.toISOString() ?? null,
      keyId: row.credential?.keyId ?? null,
    },
  }
}
