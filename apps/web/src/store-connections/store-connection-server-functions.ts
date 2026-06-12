import { createCsrfMiddleware, createServerFn } from "@tanstack/react-start"

import type { OrganizationAccessFailureStatus } from "../auth/organization-access.js"
import {
  canManageStoreCredential,
  validateStoreCredentialInput,
} from "../store-credentials/store-credential-policy.js"
import {
  canCreateStoreConnection,
  validateStoreConnectionInput,
} from "./store-connection-policy.js"

const csrfMiddleware = createCsrfMiddleware()

type StoreConnectionApp = {
  id: string
  name: string
}

type StoreConnectionListItem = {
  id: string
  store: string
  externalAppId: string
  displayName: string | null
  syncEnabled: boolean
  createdAt: string
  storeCredential: StoreCredentialStatus
}

type StoreCredentialStatus =
  | { configured: false }
  | {
      configured: true
      createdAt: string
      updatedAt: string
      encryptionAlgorithm: string
      keyId: string | null
      keyVersion: number
    }

export type ListStoreConnectionsResult =
  | {
      status: "ok"
      organization: { id: string; name: string; memberRole: string }
      app: StoreConnectionApp
      storeConnections: StoreConnectionListItem[]
    }
  | { status: "not-found" }
  | { status: OrganizationAccessFailureStatus }

export type CreateStoreConnectionResult =
  | { status: "created"; storeConnection: StoreConnectionListItem }
  | { status: "validation-error"; message: string }
  | { status: "not-found" }
  | { status: OrganizationAccessFailureStatus }

export type SaveStoreCredentialResult =
  | { status: "saved"; storeCredential: Extract<StoreCredentialStatus, { configured: true }> }
  | { status: "validation-error"; message: string }
  | { status: "configuration-error"; message: string }
  | { status: "not-found" }
  | { status: OrganizationAccessFailureStatus }

export const listStoreConnections = createServerFn({ method: "GET" })
  .validator((data: unknown) => {
    if (!data || typeof data !== "object") {
      return { appId: "" }
    }

    return { appId: String((data as { appId?: unknown }).appId ?? "") }
  })
  .handler(async ({ data }): Promise<ListStoreConnectionsResult> => {
    const [{ and, createDatabase, desc, eq, schema }, { requireActiveOrganizationMember }] =
      await Promise.all([
        import("@reviewinbox/db"),
        import("../auth/organization-context.server.js"),
      ])

    const db = createDatabase()
    const organizationContext = await requireActiveOrganizationMember()
    if (!organizationContext.ok) {
      return { status: organizationContext.reason }
    }

    const app = await findOrganizationApp({
      db,
      schema,
      and,
      eq,
      appId: data.appId,
      organizationId: organizationContext.context.organizationId,
    })
    if (!app) {
      return { status: "not-found" }
    }

    const storeConnections = await db
      .select({
        id: schema.storeConnection.id,
        store: schema.storeConnection.store,
        externalAppId: schema.storeConnection.externalAppId,
        displayName: schema.storeConnection.displayName,
        syncEnabled: schema.storeConnection.syncEnabled,
        createdAt: schema.storeConnection.createdAt,
        credentialCreatedAt: schema.storeCredential.createdAt,
        credentialUpdatedAt: schema.storeCredential.updatedAt,
        credentialEncryptionAlgorithm: schema.storeCredential.encryptionAlgorithm,
        credentialKeyId: schema.storeCredential.keyId,
        credentialKeyVersion: schema.storeCredential.keyVersion,
      })
      .from(schema.storeConnection)
      .leftJoin(
        schema.storeCredential,
        eq(schema.storeCredential.storeConnectionId, schema.storeConnection.id),
      )
      .where(
        and(
          eq(schema.storeConnection.organizationId, organizationContext.context.organizationId),
          eq(schema.storeConnection.appId, app.id),
        ),
      )
      .orderBy(desc(schema.storeConnection.createdAt))

    return {
      status: "ok",
      organization: {
        id: organizationContext.context.organizationId,
        name: organizationContext.context.organizationName,
        memberRole: organizationContext.context.memberRole,
      },
      app,
      storeConnections: storeConnections.map(toStoreConnectionListItem),
    }
  })

export const createStoreConnection = createServerFn({ method: "POST" })
  .middleware([csrfMiddleware])
  .validator((data: unknown) => {
    if (!data || typeof data !== "object") {
      return { appId: "", store: "", externalAppId: "", displayName: "", syncEnabled: false }
    }

    const input = data as {
      appId?: unknown
      store?: unknown
      externalAppId?: unknown
      displayName?: unknown
      syncEnabled?: unknown
    }

    return {
      appId: String(input.appId ?? ""),
      store: input.store,
      externalAppId: input.externalAppId,
      displayName: input.displayName,
      syncEnabled: input.syncEnabled,
    }
  })
  .handler(async ({ data }): Promise<CreateStoreConnectionResult> => {
    const [{ and, createDatabase, eq, schema }, { requireActiveOrganizationMember }] =
      await Promise.all([
        import("@reviewinbox/db"),
        import("../auth/organization-context.server.js"),
      ])

    const db = createDatabase()
    const storeConnectionInput = validateStoreConnectionInput(data)
    if (!storeConnectionInput.ok) {
      return { status: "validation-error", message: storeConnectionInput.message }
    }

    const organizationContext = await requireActiveOrganizationMember()
    if (!organizationContext.ok) {
      return { status: organizationContext.reason }
    }

    if (!canCreateStoreConnection({ memberRole: organizationContext.context.memberRole })) {
      return { status: "forbidden" }
    }

    const app = await findOrganizationApp({
      db,
      schema,
      and,
      eq,
      appId: data.appId,
      organizationId: organizationContext.context.organizationId,
    })
    if (!app) {
      return { status: "not-found" }
    }

    const [existingStoreConnection] = await db
      .select({ id: schema.storeConnection.id })
      .from(schema.storeConnection)
      .where(
        and(
          eq(schema.storeConnection.appId, app.id),
          eq(schema.storeConnection.store, storeConnectionInput.store),
        ),
      )
      .limit(1)

    if (existingStoreConnection) {
      return {
        status: "validation-error",
        message: "A Store Connection already exists for this App and store.",
      }
    }

    const [storeConnection] = await db
      .insert(schema.storeConnection)
      .values({
        organizationId: organizationContext.context.organizationId,
        appId: app.id,
        store: storeConnectionInput.store,
        externalAppId: storeConnectionInput.externalAppId,
        displayName: storeConnectionInput.displayName,
        syncEnabled: storeConnectionInput.syncEnabled,
      })
      .returning({
        id: schema.storeConnection.id,
        store: schema.storeConnection.store,
        externalAppId: schema.storeConnection.externalAppId,
        displayName: schema.storeConnection.displayName,
        syncEnabled: schema.storeConnection.syncEnabled,
        createdAt: schema.storeConnection.createdAt,
      })

    if (!storeConnection) {
      throw new Error("Store Connection creation did not return a Store Connection.")
    }

    return { status: "created", storeConnection: toStoreConnectionListItem(storeConnection) }
  })

export const saveStoreCredential = createServerFn({ method: "POST" })
  .middleware([csrfMiddleware])
  .validator((data: unknown) => {
    if (!data || typeof data !== "object") {
      return { appId: "", storeConnectionId: "", credentialMaterial: "" }
    }

    const input = data as {
      appId?: unknown
      storeConnectionId?: unknown
      credentialMaterial?: unknown
    }

    return {
      appId: String(input.appId ?? ""),
      storeConnectionId: String(input.storeConnectionId ?? ""),
      credentialMaterial: input.credentialMaterial,
    }
  })
  .handler(async ({ data }): Promise<SaveStoreCredentialResult> => {
    const [
      { StoreCredentialVault, StoreCredentialVaultError },
      { and, createDatabase, eq, schema, sql },
      { requireActiveOrganizationMember },
    ] = await Promise.all([
      import("@reviewinbox/core"),
      import("@reviewinbox/db"),
      import("../auth/organization-context.server.js"),
    ])

    const storeCredentialInput = validateStoreCredentialInput(data)
    if (!storeCredentialInput.ok) {
      return { status: "validation-error", message: storeCredentialInput.message }
    }

    const db = createDatabase()
    const organizationContext = await requireActiveOrganizationMember()
    if (!organizationContext.ok) {
      return { status: organizationContext.reason }
    }

    if (!canManageStoreCredential({ memberRole: organizationContext.context.memberRole })) {
      return { status: "forbidden" }
    }

    const app = await findOrganizationApp({
      db,
      schema,
      and,
      eq,
      appId: data.appId,
      organizationId: organizationContext.context.organizationId,
    })
    if (!app) {
      return { status: "not-found" }
    }

    const storeConnection = await findOrganizationStoreConnection({
      db,
      schema,
      and,
      eq,
      appId: app.id,
      organizationId: organizationContext.context.organizationId,
      storeConnectionId: data.storeConnectionId,
    })
    if (!storeConnection) {
      return { status: "not-found" }
    }

    let encrypted
    try {
      encrypted = StoreCredentialVault.fromEnvironment().encrypt(
        storeCredentialInput.credentialMaterial,
        {
          organizationId: organizationContext.context.organizationId,
          appId: app.id,
          storeConnectionId: storeConnection.id,
        },
      )
    } catch (error) {
      if (error instanceof StoreCredentialVaultError) {
        return {
          status: "configuration-error",
          message: "Store Credential encryption is not configured correctly.",
        }
      }
      throw error
    }

    const [storeCredential] = await db
      .insert(schema.storeCredential)
      .values({
        organizationId: organizationContext.context.organizationId,
        appId: app.id,
        storeConnectionId: storeConnection.id,
        ciphertext: encrypted.ciphertext,
        encryptionAlgorithm: encrypted.encryptionAlgorithm,
        nonce: encrypted.nonce,
        authTag: encrypted.authTag,
        keyId: encrypted.keyId,
        keyVersion: encrypted.keyVersion,
      })
      .onConflictDoUpdate({
        target: schema.storeCredential.storeConnectionId,
        set: {
          ciphertext: encrypted.ciphertext,
          encryptionAlgorithm: encrypted.encryptionAlgorithm,
          nonce: encrypted.nonce,
          authTag: encrypted.authTag,
          keyId: encrypted.keyId,
          keyVersion: encrypted.keyVersion,
          updatedAt: sql`now()`,
        },
      })
      .returning({
        createdAt: schema.storeCredential.createdAt,
        updatedAt: schema.storeCredential.updatedAt,
        encryptionAlgorithm: schema.storeCredential.encryptionAlgorithm,
        keyId: schema.storeCredential.keyId,
        keyVersion: schema.storeCredential.keyVersion,
      })

    if (!storeCredential) {
      throw new Error("Store Credential save did not return metadata.")
    }

    return { status: "saved", storeCredential: toConfiguredStoreCredentialStatus(storeCredential) }
  })

async function findOrganizationApp(input: {
  db: ReturnType<typeof import("@reviewinbox/db").createDatabase>
  schema: typeof import("@reviewinbox/db").schema
  and: typeof import("@reviewinbox/db").and
  eq: typeof import("@reviewinbox/db").eq
  appId: string
  organizationId: string
}): Promise<StoreConnectionApp | null> {
  const [app] = await input.db
    .select({ id: input.schema.app.id, name: input.schema.app.name })
    .from(input.schema.app)
    .where(
      input.and(
        input.eq(input.schema.app.id, input.appId),
        input.eq(input.schema.app.organizationId, input.organizationId),
      ),
    )
    .limit(1)

  return app ?? null
}

async function findOrganizationStoreConnection(input: {
  db: ReturnType<typeof import("@reviewinbox/db").createDatabase>
  schema: typeof import("@reviewinbox/db").schema
  and: typeof import("@reviewinbox/db").and
  eq: typeof import("@reviewinbox/db").eq
  appId: string
  organizationId: string
  storeConnectionId: string
}): Promise<{ id: string } | null> {
  const [storeConnection] = await input.db
    .select({ id: input.schema.storeConnection.id })
    .from(input.schema.storeConnection)
    .where(
      input.and(
        input.eq(input.schema.storeConnection.id, input.storeConnectionId),
        input.eq(input.schema.storeConnection.appId, input.appId),
        input.eq(input.schema.storeConnection.organizationId, input.organizationId),
      ),
    )
    .limit(1)

  return storeConnection ?? null
}

function toStoreConnectionListItem(storeConnection: {
  id: string
  store: string
  externalAppId: string
  displayName: string | null
  syncEnabled: boolean
  createdAt: Date
  credentialCreatedAt?: Date | null
  credentialUpdatedAt?: Date | null
  credentialEncryptionAlgorithm?: string | null
  credentialKeyId?: string | null
  credentialKeyVersion?: number | null
}): StoreConnectionListItem {
  return {
    id: storeConnection.id,
    store: storeConnection.store,
    externalAppId: storeConnection.externalAppId,
    displayName: storeConnection.displayName,
    syncEnabled: storeConnection.syncEnabled,
    createdAt: storeConnection.createdAt.toISOString(),
    storeCredential: toStoreCredentialStatus(storeConnection),
  }
}

function toStoreCredentialStatus(storeCredential: {
  credentialCreatedAt?: Date | null
  credentialUpdatedAt?: Date | null
  credentialEncryptionAlgorithm?: string | null
  credentialKeyId?: string | null
  credentialKeyVersion?: number | null
}): StoreCredentialStatus {
  if (
    !storeCredential.credentialCreatedAt ||
    !storeCredential.credentialUpdatedAt ||
    !storeCredential.credentialEncryptionAlgorithm ||
    !storeCredential.credentialKeyVersion
  ) {
    return { configured: false }
  }

  return toConfiguredStoreCredentialStatus({
    createdAt: storeCredential.credentialCreatedAt,
    updatedAt: storeCredential.credentialUpdatedAt,
    encryptionAlgorithm: storeCredential.credentialEncryptionAlgorithm,
    keyId: storeCredential.credentialKeyId ?? null,
    keyVersion: storeCredential.credentialKeyVersion,
  })
}

function toConfiguredStoreCredentialStatus(storeCredential: {
  createdAt: Date
  updatedAt: Date
  encryptionAlgorithm: string
  keyId: string | null
  keyVersion: number
}): Extract<StoreCredentialStatus, { configured: true }> {
  return {
    configured: true,
    createdAt: storeCredential.createdAt.toISOString(),
    updatedAt: storeCredential.updatedAt.toISOString(),
    encryptionAlgorithm: storeCredential.encryptionAlgorithm,
    keyId: storeCredential.keyId,
    keyVersion: storeCredential.keyVersion,
  }
}
