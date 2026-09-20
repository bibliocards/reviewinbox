import {
  getEffectiveOrganizationLimits,
  getMonthlyUsagePeriod,
  getUsagePercent,
  getUsageSeverity,
} from '@reviewinbox/billing'
import {
  deleteOrganizationRequestSchema,
  deleteOrganizationResponseSchema,
  organizationUsageResponseSchema,
  organizationProfileResponseSchema,
  updateOrganizationProfileRequestSchema,
} from '@reviewinbox/contracts'
import {
  apps,
  member,
  organization as organizationTable,
  storeConnections,
  subscription,
  usageEvents,
} from '@reviewinbox/db'
import { and, count, eq, gte, inArray, lt, ne, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import type { Context } from 'hono'

import {
  requireActiveOrganizationManagerSession,
  requireActiveOrganizationOwnerSession,
} from '../auth/session'
import { database, serverConfig } from '../db'
import { parseJsonBody } from '../http/validation'
import { createOrganizationLogoStorage } from '../storage/organization-logo-storage'
import { organizationDeletionBlockingStatuses } from './organization-deletion'

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

organizationProfileRoutes.get('/api/organization/usage', async (context) => {
  const sessionResult = await requireActiveOrganizationManagerSession(context)
  if (!sessionResult.ok) {
    return sessionResult.response
  }
  return getOrganizationUsage(context, sessionResult.session.organizationId)
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

  return uploadOrganizationLogo(
    context,
    sessionResult.session.organizationId,
    sessionResult.session.role,
  )
})

organizationProfileRoutes.delete('/api/organization', async (context) => {
  const sessionResult = await requireActiveOrganizationOwnerSession(context)
  if (!sessionResult.ok) {
    return sessionResult.response
  }

  return deleteOrganization(
    context,
    sessionResult.session.organizationId,
    sessionResult.session.userId,
  )
})

async function getOrganizationUsage(context: Context, organizationId: string) {
  const organization = await database.query.organization.findFirst({
    columns: { id: true, planName: true, billingOverrides: true },
    where: eq(organizationTable.id, organizationId),
  })
  if (!organization) {
    return context.json({ error: 'Organization not found.' }, 404)
  }

  const period = getMonthlyUsagePeriod()
  const usage = await selectOrganizationUsage(organization.id, period.startsAt, period.endsAt)
  return context.json(buildOrganizationUsageResponse(organization, period, usage))
}

async function selectOrganizationUsage(organizationId: string, startsAt: Date, endsAt: Date) {
  const [
    [memberCount],
    [appCount],
    [storeConnectionCount],
    [monthlyReviewImports],
    [monthlyManagedAiReplyDrafts],
  ] = await Promise.all([
    database
      .select({ count: count() })
      .from(member)
      .where(eq(member.organizationId, organizationId)),
    database.select({ count: count() }).from(apps).where(eq(apps.organizationId, organizationId)),
    database
      .select({ count: count() })
      .from(storeConnections)
      .where(eq(storeConnections.organizationId, organizationId)),
    selectUsageQuantity(organizationId, 'review_imported', startsAt, endsAt),
    selectUsageQuantity(organizationId, 'managed_ai_reply_draft_generated', startsAt, endsAt),
  ])
  return {
    memberCount,
    appCount,
    storeConnectionCount,
    monthlyReviewImports,
    monthlyManagedAiReplyDrafts,
  }
}

function buildOrganizationUsageResponse(
  organization: {
    planName: typeof organizationTable.$inferSelect.planName
    billingOverrides: typeof organizationTable.$inferSelect.billingOverrides
  },
  period: ReturnType<typeof getMonthlyUsagePeriod>,
  usage: Awaited<ReturnType<typeof selectOrganizationUsage>>,
) {
  const limits = getEffectiveOrganizationLimits(
    organization.planName,
    organization.billingOverrides,
  )
  const limitsEnforced = serverConfig.deploymentMode === 'cloud'
  return organizationUsageResponseSchema.parse({
    deploymentMode: serverConfig.deploymentMode,
    planName: organization.planName,
    limitsEnforced,
    usagePeriod: {
      key: period.key,
      startsAt: period.startsAt.toISOString(),
      endsAt: period.endsAt.toISOString(),
    },
    usage: buildUsageDetails(usage, limits, limitsEnforced),
  })
}

function usageCount(row: { count: number } | undefined): number {
  return row?.count ?? 0
}

function usageQuantity(row: { quantity: number } | undefined): number {
  return row?.quantity ?? 0
}

function buildUsageDetails(
  usage: Awaited<ReturnType<typeof selectOrganizationUsage>>,
  limits: ReturnType<typeof getEffectiveOrganizationLimits>,
  limitsEnforced: boolean,
) {
  return {
    members: toUsageItem(
      usageCount(usage.memberCount),
      limits.includedMembers,
      limits.memberLimit,
      limitsEnforced,
    ),
    apps: toUsageItem(
      usageCount(usage.appCount),
      limits.includedApps,
      limits.appLimit,
      limitsEnforced,
    ),
    storeConnections: toUsageItem(
      usageCount(usage.storeConnectionCount),
      limits.includedStoreConnections,
      limits.storeConnectionLimit,
      limitsEnforced,
    ),
    monthlyReviewImports: toUsageItem(
      usageQuantity(usage.monthlyReviewImports),
      limits.includedMonthlyReviewImports,
      limits.monthlyReviewImportCap,
      limitsEnforced,
    ),
    monthlyManagedAiReplyDrafts: toUsageItem(
      usageQuantity(usage.monthlyManagedAiReplyDrafts),
      limits.includedMonthlyManagedAiReplyDrafts,
      limits.monthlyManagedAiReplyDraftCap,
      limitsEnforced,
    ),
  }
}

type LogoUpload = { file: File; bytes: Uint8Array; extension: string }
type LogoUploadResult =
  | { ok: true; upload: LogoUpload }
  | { ok: false; error: string; status: 400 | 413 }

async function parseLogoUpload(context: Context): Promise<LogoUploadResult> {
  const body = await context.req.parseBody()
  const file = body['logo']
  if (!(file instanceof File)) {
    return { ok: false, error: 'Logo file is required.', status: 400 }
  }
  return validateLogoFile(file)
}

async function validateLogoFile(file: File): Promise<LogoUploadResult> {
  const extension = acceptedLogoTypes.get(file.type)
  if (extension === undefined) {
    return { ok: false, error: 'Logo must be a PNG, JPEG, or WebP image.', status: 400 }
  }
  if (file.size > maxLogoBytes) {
    return { ok: false, error: 'Logo must be 5MB or smaller.', status: 413 }
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!matchesImageSignature(bytes, file.type)) {
    return { ok: false, error: 'Logo file content does not match its image type.', status: 400 }
  }
  return { ok: true, upload: { file, bytes, extension } }
}

async function uploadOrganizationLogo(context: Context, organizationId: string, role: string) {
  const uploadResult = await parseLogoUpload(context)
  if (!uploadResult.ok) {
    return context.json({ error: uploadResult.error }, uploadResult.status)
  }
  const current = await database.query.organization.findFirst({
    where: eq(organizationTable.id, organizationId),
  })
  if (!current) {
    return context.json({ error: 'Organization not found.' }, 404)
  }
  const { file, bytes, extension } = uploadResult.upload
  const logo = await logoStorage.put({ organizationId, bytes, contentType: file.type, extension })
  const [updated] = await database
    .update(organizationTable)
    .set({ logo })
    .where(eq(organizationTable.id, organizationId))
    .returning()
  await deleteLogoBestEffort(current.logo)
  return context.json(
    organizationProfileResponseSchema.parse({
      id: updated?.id ?? current.id,
      name: updated?.name ?? current.name,
      logo: updated?.logo ?? logo,
      role,
      canDelete: role === 'owner',
      deletionAvailable: serverConfig.deploymentMode === 'cloud',
    }),
  )
}

async function deleteOrganization(context: Context, organizationId: string, userId: string) {
  const requestResult = await prepareOrganizationDeletion(context, organizationId)
  if (!requestResult.ok) {
    return requestResult.response
  }
  if (await hasActiveSubscription(organizationId)) {
    return context.json(
      { error: 'Cancel the active Stripe subscription before deleting this Organization.' },
      409,
    )
  }
  const nextOrganizationId = await findNextOrganizationId(userId, organizationId)
  await database.delete(organizationTable).where(eq(organizationTable.id, organizationId))
  await deleteLogoBestEffort(requestResult.organization.logo)
  return context.json(deleteOrganizationResponseSchema.parse({ nextOrganizationId }))
}

async function prepareOrganizationDeletion(
  context: Context,
  organizationId: string,
): Promise<
  | { ok: true; organization: typeof organizationTable.$inferSelect }
  | { ok: false; response: Response }
> {
  if (serverConfig.deploymentMode !== 'cloud') {
    return {
      ok: false,
      response: context.json(
        { error: 'Organization deletion is only available in cloud deployments.' },
        403,
      ),
    }
  }
  const bodyResult = await parseJsonBody(context, deleteOrganizationRequestSchema)
  if (!bodyResult.ok) {
    return { ok: false, response: bodyResult.response }
  }
  return getDeletionTarget(context, organizationId, bodyResult.data.name)
}

async function getDeletionTarget(
  context: Context,
  organizationId: string,
  confirmedName: string,
): Promise<
  | { ok: true; organization: typeof organizationTable.$inferSelect }
  | { ok: false; response: Response }
> {
  const organization = await database.query.organization.findFirst({
    where: eq(organizationTable.id, organizationId),
  })
  if (!organization) {
    return { ok: false, response: context.json({ error: 'Organization not found.' }, 404) }
  }
  if (confirmedName !== organization.name) {
    return {
      ok: false,
      response: context.json({ error: 'Organization name confirmation does not match.' }, 400),
    }
  }
  return { ok: true, organization }
}

async function hasActiveSubscription(organizationId: string): Promise<boolean> {
  const activeSubscription = await database.query.subscription.findFirst({
    columns: { id: true },
    where: and(
      eq(subscription.referenceId, organizationId),
      inArray(subscription.status, organizationDeletionBlockingStatuses()),
    ),
  })
  return activeSubscription !== undefined
}

async function findNextOrganizationId(
  userId: string,
  organizationId: string,
): Promise<string | null> {
  const nextMembership = await database.query.member.findFirst({
    columns: { organizationId: true },
    where: and(eq(member.userId, userId), ne(member.organizationId, organizationId)),
  })
  return nextMembership?.organizationId ?? null
}

function matchesImageSignature(bytes: Uint8Array, contentType: string): boolean {
  if (contentType === 'image/png') {
    return hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47])
  }
  if (contentType === 'image/jpeg') {
    return hasPrefix(bytes, [0xff, 0xd8]) && hasSuffix(bytes, [0xff, 0xd9])
  }
  return (
    contentType === 'image/webp'
    && hasPrefix(bytes, [0x52, 0x49, 0x46, 0x46])
    && hasPrefixAt(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  )
}

function hasPrefix(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((value, index) => bytes.at(index) === value)
}

function hasPrefixAt(bytes: Uint8Array, signature: number[], offset: number): boolean {
  return signature.every((value, index) => bytes.at(offset + index) === value)
}

function hasSuffix(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every(
    (value, index) => bytes.at(bytes.length - signature.length + index) === value,
  )
}

async function deleteLogoBestEffort(logo: string | null | undefined): Promise<void> {
  try {
    await logoStorage.deleteByUrl(logo)
  } catch (error) {
    process.stderr.write(
      `Unable to delete Organization logo from storage: ${error instanceof Error ? error.message : 'unknown error'}\n`,
    )
  }
}

function selectUsageQuantity(
  organizationId: string,
  type: typeof usageEvents.$inferSelect.type,
  startsAt: Date,
  endsAt: Date,
) {
  return database
    .select({ quantity: sql<number>`coalesce(sum(${usageEvents.quantity}), 0)::int` })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.organizationId, organizationId),
        eq(usageEvents.type, type),
        gte(usageEvents.occurredAt, startsAt),
        lt(usageEvents.occurredAt, endsAt),
      ),
    )
}

function toUsageItem(used: number, included: number, limit: number, limitsEnforced: boolean) {
  if (!limitsEnforced) {
    return { used, included, limit: null, percent: null, severity: null }
  }

  return {
    used,
    included,
    limit,
    percent: getUsagePercent(used, limit),
    severity: getUsageSeverity(used, limit),
  }
}
