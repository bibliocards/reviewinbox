import { createCsrfMiddleware, createServerFn } from "@tanstack/react-start"

import type { OrganizationAccessFailureStatus } from "../auth/organization-access.js"
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
      })
      .from(schema.storeConnection)
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

function toStoreConnectionListItem(storeConnection: {
  id: string
  store: string
  externalAppId: string
  displayName: string | null
  syncEnabled: boolean
  createdAt: Date
}): StoreConnectionListItem {
  return {
    id: storeConnection.id,
    store: storeConnection.store,
    externalAppId: storeConnection.externalAppId,
    displayName: storeConnection.displayName,
    syncEnabled: storeConnection.syncEnabled,
    createdAt: storeConnection.createdAt.toISOString(),
  }
}
