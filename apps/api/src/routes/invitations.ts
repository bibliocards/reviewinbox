import { invitationDetailsResponseSchema } from '@reviewinbox/contracts'
import { invitation, organization } from '@reviewinbox/db'
import { and, eq, gt } from 'drizzle-orm'
import { Hono } from 'hono'

import { database } from '../db'

export const invitationsRoutes = new Hono()

invitationsRoutes.get('/api/invitations/:invitationId', async (context) => {
  const invitationId = context.req.param('invitationId')

  const [row] = await database
    .select({
      id: invitation.id,
      email: invitation.email,
      organizationName: organization.name,
    })
    .from(invitation)
    .innerJoin(organization, eq(organization.id, invitation.organizationId))
    .where(and(eq(invitation.id, invitationId), eq(invitation.status, 'pending'), gt(invitation.expiresAt, new Date())))
    .limit(1)

  if (!row) {
    return context.json({ error: 'Invitation not found.' }, 404)
  }

  return context.json(invitationDetailsResponseSchema.parse(row))
})
