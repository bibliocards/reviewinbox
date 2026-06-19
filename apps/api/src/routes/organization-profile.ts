import {
  deleteOrganizationRequestSchema,
  deleteOrganizationResponseSchema,
  organizationProfileResponseSchema,
  updateOrganizationProfileRequestSchema,
} from '@reviewinbox/contracts'
import { member, organization as organizationTable } from '@reviewinbox/db'
import { and, eq, ne } from 'drizzle-orm'
import { Hono } from 'hono'

import { requireActiveOrganizationManagerSession, requireActiveOrganizationOwnerSession } from '../auth/session'
import { database, serverConfig } from '../db'
import { parseJsonBody } from '../http/validation'
import { createOrganizationLogoStorage } from '../storage/organization-logo-storage'

const maxLogoBytes = 5 * 1024 * 1024
const acceptedLogoTypes = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
])

const logoStorage = createOrganizationLogoStorage(serverConfig)

export const organizationProfileRoutes = new Hono()

organizationProfileRoutes.get('/api/organization/profile', async (context) => {
  const sessionResult = await requireActiveOrganizationManagerSession(context)
  if (!sessionResult.ok) {
    return sessionResult.response
  }

  const row = await database.query.organization.findFirst({
    where: eq(organizationTable.id, sessionResult.session.organizationId),
  })

  if (!row) {
    return context.json({ error: 'Organization not found.' }, 404)
  }

  return context.json(
    organizationProfileResponseSchema.parse({
      id: row.id,
      name: row.name,
      logo: row.logo,
      role: sessionResult.session.role,
      canDelete: sessionResult.session.role === 'owner',
      deletionAvailable: serverConfig.deploymentMode === 'cloud',
    }),
  )
})

organizationProfileRoutes.patch('/api/organization/profile', async (context) => {
  const sessionResult = await requireActiveOrganizationManagerSession(context)
  if (!sessionResult.ok) {
    return sessionResult.response
  }

  const bodyResult = await parseJsonBody(context, updateOrganizationProfileRequestSchema)
  if (!bodyResult.ok) {
    return bodyResult.response
  }

  const [updated] = await database
    .update(organizationTable)
    .set({ name: bodyResult.data.name })
    .where(eq(organizationTable.id, sessionResult.session.organizationId))
    .returning()

  if (!updated) {
    return context.json({ error: 'Organization not found.' }, 404)
  }

  return context.json(
    organizationProfileResponseSchema.parse({
      id: updated.id,
      name: updated.name,
      logo: updated.logo,
      role: sessionResult.session.role,
      canDelete: sessionResult.session.role === 'owner',
      deletionAvailable: serverConfig.deploymentMode === 'cloud',
    }),
  )
})

organizationProfileRoutes.put('/api/organization/profile/logo', async (context) => {
  const sessionResult = await requireActiveOrganizationManagerSession(context)
  if (!sessionResult.ok) {
    return sessionResult.response
  }

  const body = await context.req.parseBody()
  const file = body['logo']
  if (!(file instanceof File)) {
    return context.json({ error: 'Logo file is required.' }, 400)
  }

  const extension = acceptedLogoTypes.get(file.type)
  if (!extension) {
    return context.json({ error: 'Logo must be a PNG, JPEG, or WebP image.' }, 400)
  }

  if (file.size > maxLogoBytes) {
    return context.json({ error: 'Logo must be 5MB or smaller.' }, 413)
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!matchesImageSignature(bytes, file.type)) {
    return context.json({ error: 'Logo file content does not match its image type.' }, 400)
  }

  const current = await database.query.organization.findFirst({
    where: eq(organizationTable.id, sessionResult.session.organizationId),
  })

  if (!current) {
    return context.json({ error: 'Organization not found.' }, 404)
  }

  const logo = await logoStorage.put({ organizationId: sessionResult.session.organizationId, bytes, contentType: file.type, extension })
  const [updated] = await database
    .update(organizationTable)
    .set({ logo })
    .where(eq(organizationTable.id, sessionResult.session.organizationId))
    .returning()

  await deleteLogoBestEffort(current.logo)

  return context.json(
    organizationProfileResponseSchema.parse({
      id: updated?.id ?? current.id,
      name: updated?.name ?? current.name,
      logo: updated?.logo ?? logo,
      role: sessionResult.session.role,
      canDelete: sessionResult.session.role === 'owner',
      deletionAvailable: serverConfig.deploymentMode === 'cloud',
    }),
  )
})

organizationProfileRoutes.delete('/api/organization', async (context) => {
  const sessionResult = await requireActiveOrganizationOwnerSession(context)
  if (!sessionResult.ok) {
    return sessionResult.response
  }

  if (serverConfig.deploymentMode !== 'cloud') {
    return context.json({ error: 'Organization deletion is only available in cloud deployments.' }, 403)
  }

  const bodyResult = await parseJsonBody(context, deleteOrganizationRequestSchema)
  if (!bodyResult.ok) {
    return bodyResult.response
  }

  const current = await database.query.organization.findFirst({
    where: eq(organizationTable.id, sessionResult.session.organizationId),
  })

  if (!current) {
    return context.json({ error: 'Organization not found.' }, 404)
  }

  if (bodyResult.data.name !== current.name) {
    return context.json({ error: 'Organization name confirmation does not match.' }, 400)
  }

  const nextMembership = await database.query.member.findFirst({
    columns: { organizationId: true },
    where: and(eq(member.userId, sessionResult.session.userId), ne(member.organizationId, sessionResult.session.organizationId)),
  })

  await database.delete(organizationTable).where(eq(organizationTable.id, sessionResult.session.organizationId))
  await deleteLogoBestEffort(current.logo)

  return context.json(deleteOrganizationResponseSchema.parse({ nextOrganizationId: nextMembership?.organizationId ?? null }))
})

function matchesImageSignature(bytes: Uint8Array, contentType: string): boolean {
  if (contentType === 'image/png') {
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  }

  if (contentType === 'image/jpeg') {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9
  }

  if (contentType === 'image/webp') {
    return bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45
  }

  return false
}

async function deleteLogoBestEffort(logo: string | null | undefined): Promise<void> {
  try {
    await logoStorage.deleteByUrl(logo)
  } catch (error) {
    console.warn('Unable to delete Organization logo from storage.', error)
  }
}
