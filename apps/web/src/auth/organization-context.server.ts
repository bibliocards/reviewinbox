import { and, createDatabase, eq, schema } from "@reviewinbox/db"
import { getRequestHeaders } from "@tanstack/react-start/server"

import { hasVerifiedOrganizationMembership } from "../apps/app-policy.js"
import type { OrganizationAccessFailureStatus } from "./organization-access.js"
import { auth } from "./server.js"

export type ActiveOrganizationContext = {
  organizationId: string
  organizationName: string
  userId: string
  memberRole: string
}

export type ActiveOrganizationContextResult =
  | { ok: true; context: ActiveOrganizationContext }
  | { ok: false; reason: OrganizationAccessFailureStatus }

export async function requireActiveOrganizationMember(): Promise<ActiveOrganizationContextResult> {
  const db = createDatabase()
  const session = await auth.api.getSession({
    headers: getRequestHeaders(),
  })

  if (!session) {
    return { ok: false, reason: "unauthenticated" }
  }

  const activeOrganizationId = session.session.activeOrganizationId
  if (!activeOrganizationId) {
    return { ok: false, reason: "missing-active-organization" }
  }

  const [membership] = await db
    .select({
      memberOrganizationId: schema.member.organizationId,
      memberRole: schema.member.role,
      organizationName: schema.organization.name,
    })
    .from(schema.member)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.member.organizationId))
    .where(
      and(
        eq(schema.member.userId, session.user.id),
        eq(schema.member.organizationId, activeOrganizationId),
      ),
    )
    .limit(1)

  if (
    !membership ||
    !hasVerifiedOrganizationMembership({
      activeOrganizationId,
      memberOrganizationId: membership?.memberOrganizationId,
    })
  ) {
    return { ok: false, reason: "forbidden" }
  }

  return {
    ok: true,
    context: {
      organizationId: activeOrganizationId,
      organizationName: membership.organizationName,
      userId: session.user.id,
      memberRole: membership.memberRole,
    },
  }
}
