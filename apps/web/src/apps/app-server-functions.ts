import { createDatabase, desc, eq, schema } from "@reviewinbox/db"
import { createCsrfMiddleware, createServerFn } from "@tanstack/react-start"

import { requireActiveOrganizationMember } from "../auth/organization-context.server.js"
import type { OrganizationAccessFailureStatus } from "../auth/organization-access.js"
import { canCreateApp, validateAppName } from "./app-policy.js"

const csrfMiddleware = createCsrfMiddleware()

type AppListItem = {
  id: string
  name: string
  autoDraftReplies: boolean
  defaultReplyLanguage: string
  createdAt: string
}

export type ListAppsResult =
  | {
      status: "ok"
      organization: { id: string; name: string; memberRole: string }
      apps: AppListItem[]
    }
  | { status: OrganizationAccessFailureStatus }

export type CreateAppResult =
  | { status: "created"; app: AppListItem }
  | { status: "validation-error"; message: string }
  | { status: OrganizationAccessFailureStatus }

export const listApps = createServerFn({ method: "GET" }).handler(
  async (): Promise<ListAppsResult> => {
    const db = createDatabase()
    const organizationContext = await requireActiveOrganizationMember()
    if (!organizationContext.ok) {
      return { status: organizationContext.reason }
    }

    const apps = await db
      .select({
        id: schema.app.id,
        name: schema.app.name,
        autoDraftReplies: schema.app.autoDraftReplies,
        defaultReplyLanguage: schema.app.defaultReplyLanguage,
        createdAt: schema.app.createdAt,
      })
      .from(schema.app)
      .where(eq(schema.app.organizationId, organizationContext.context.organizationId))
      .orderBy(desc(schema.app.createdAt))

    return {
      status: "ok",
      organization: {
        id: organizationContext.context.organizationId,
        name: organizationContext.context.organizationName,
        memberRole: organizationContext.context.memberRole,
      },
      apps: apps.map(toAppListItem),
    }
  },
)

export const createApp = createServerFn({ method: "POST" })
  .middleware([csrfMiddleware])
  .validator((data: unknown) => {
    if (!data || typeof data !== "object") {
      return { name: "" }
    }

    return { name: (data as { name?: unknown }).name }
  })
  .handler(async ({ data }): Promise<CreateAppResult> => {
    const db = createDatabase()
    const appName = validateAppName(data.name)
    if (!appName.ok) {
      return { status: "validation-error", message: appName.message }
    }

    const organizationContext = await requireActiveOrganizationMember()
    if (!organizationContext.ok) {
      return { status: organizationContext.reason }
    }

    if (!canCreateApp({ memberRole: organizationContext.context.memberRole })) {
      return { status: "forbidden" }
    }

    const [app] = await db
      .insert(schema.app)
      .values({
        organizationId: organizationContext.context.organizationId,
        name: appName.name,
      })
      .returning({
        id: schema.app.id,
        name: schema.app.name,
        autoDraftReplies: schema.app.autoDraftReplies,
        defaultReplyLanguage: schema.app.defaultReplyLanguage,
        createdAt: schema.app.createdAt,
      })

    if (!app) {
      throw new Error("App creation did not return an App.")
    }

    return { status: "created", app: toAppListItem(app) }
  })

function toAppListItem(app: {
  id: string
  name: string
  autoDraftReplies: boolean
  defaultReplyLanguage: string
  createdAt: Date
}): AppListItem {
  return {
    id: app.id,
    name: app.name,
    autoDraftReplies: app.autoDraftReplies,
    defaultReplyLanguage: app.defaultReplyLanguage,
    createdAt: app.createdAt.toISOString(),
  }
}
