import { invitation, user } from '@reviewinbox/db'
import { and, count, eq, gt } from 'drizzle-orm'
import type { MiddlewareHandler } from 'hono'

import { database, serverConfig } from '../db'

export const requireInvitationForSelfHostedSignUp: MiddlewareHandler = async (context, next) => {
  if (context.req.method !== 'POST' || serverConfig.deploymentMode === 'cloud') {
    await next()
    return
  }

  const [result] = await database.select({ count: count() }).from(user)

  if ((result?.count ?? 0) === 0) {
    await next()
    return
  }

  const body = await context.req.raw
    .clone()
    .json()
    .catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.toLowerCase() : ''
  const invitationId = typeof body?.invitationId === 'string' ? body.invitationId : ''

  if (!email || !invitationId) {
    return context.json({ error: 'Sign-up is only available with a valid invitation.' }, 403)
  }

  const [existingInvitation] = await database
    .select({ id: invitation.id })
    .from(invitation)
    .where(
      and(
        eq(invitation.id, invitationId),
        eq(invitation.email, email),
        eq(invitation.status, 'pending'),
        gt(invitation.expiresAt, new Date()),
      ),
    )
    .limit(1)

  if (!existingInvitation) {
    return context.json({ error: 'Sign-up is only available with a valid invitation.' }, 403)
  }

  await next()
}
