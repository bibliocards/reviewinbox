import { and, eq } from 'drizzle-orm'
import type { Context } from 'hono'

import { member } from '@reviewinbox/db'

import { auth } from '../auth'
import { database } from '../db'

type ActiveOrganizationSession = {
  userId: string
  organizationId: string
  role: string
}

export async function requireActiveOrganizationSession(
  context: Context,
): Promise<{ ok: true; session: ActiveOrganizationSession } | { ok: false; response: Response }> {
  const session = await auth.api.getSession({ headers: context.req.raw.headers })

  if (!session) {
    return { ok: false, response: context.json({ error: 'Authentication required.' }, 401) }
  }

  const activeOrganizationId = (session.session as typeof session.session & { activeOrganizationId?: string }).activeOrganizationId
  if (!activeOrganizationId) {
    return { ok: false, response: context.json({ error: 'Active Organization required.' }, 403) }
  }

  const membership = await database.query.member.findFirst({
    columns: { id: true, role: true },
    where: and(eq(member.userId, session.user.id), eq(member.organizationId, activeOrganizationId)),
  })

  if (!membership) {
    return {
      ok: false,
      response: context.json({ error: 'Active Organization is not available.' }, 403),
    }
  }

  return {
    ok: true,
    session: {
      userId: session.user.id,
      organizationId: activeOrganizationId,
      role: membership.role,
    },
  }
}

export async function requireActiveOrganizationOwnerSession(
  context: Context,
): Promise<{ ok: true; session: ActiveOrganizationSession } | { ok: false; response: Response }> {
  const sessionResult = await requireActiveOrganizationSession(context)
  if (!sessionResult.ok) {
    return sessionResult
  }

  if (sessionResult.session.role !== 'owner') {
    return {
      ok: false,
      response: context.json({ error: 'Organization Owner permission required.' }, 403),
    }
  }

  return sessionResult
}

export async function requireActiveOrganizationManagerSession(
  context: Context,
): Promise<{ ok: true; session: ActiveOrganizationSession } | { ok: false; response: Response }> {
  const sessionResult = await requireActiveOrganizationSession(context)
  if (!sessionResult.ok) {
    return sessionResult
  }

  if (!['owner', 'admin'].includes(sessionResult.session.role)) {
    return {
      ok: false,
      response: context.json({ error: 'Organization Admin permission required.' }, 403),
    }
  }

  return sessionResult
}
