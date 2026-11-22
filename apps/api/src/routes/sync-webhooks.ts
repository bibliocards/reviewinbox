import { randomUUID } from 'node:crypto'

import { loadEncryptionConfig } from '@reviewinbox/config'
import {
  type SyncWebhookInput,
  syncWebhookInputSchema,
  syncWebhookSettingsSchema,
} from '@reviewinbox/contracts'
import {
  decodeStoreCredentialEncryptionKey,
  decryptStoreCredential,
  encryptStoreCredential,
} from '@reviewinbox/core'
import { syncWebhookDeliveries, syncWebhookDestinations } from '@reviewinbox/db'
import {
  deliverSyncWebhook,
  enqueueOpenIncidents,
  lockSyncNotifications,
  webhookUrl,
} from '@reviewinbox/sync'
import { eq } from 'drizzle-orm'
import { type Context, Hono } from 'hono'

import { requireActiveOrganizationManagerSession } from '../auth/session'
import { database, serverConfig } from '../db'
import { parseJsonBody } from '../http/validation'

const settingsPath = '/api/organization/sync-webhook'
export const syncWebhookRoutes = new Hono()

syncWebhookRoutes.get(settingsPath, async (context) => {
  const session = await requireActiveOrganizationManagerSession(context)
  if (!session.ok) {
    return session.response
  }
  return context.json(await readSettings(session.session.organizationId))
})

syncWebhookRoutes.put(settingsPath, async (context) => {
  const session = await requireActiveOrganizationManagerSession(context)
  if (!session.ok) {
    return session.response
  }
  const body = await parseJsonBody(context, syncWebhookInputSchema)
  if (!body.ok) {
    return body.response
  }
  if (!webhookUrl(body.data)) {
    return context.json({ errorCode: 'invalid_webhook_url' }, 400)
  }
  const { organizationId } = session.session
  await saveDestination(organizationId, body.data)
  return context.json(await readSettings(organizationId))
})

async function saveDestination(organizationId: string, destination: SyncWebhookInput) {
  const key = webhookEncryptionKey()
  const plaintext = JSON.stringify(destination)
  const input = {
    kind: destination.kind,
    appOrigin: serverConfig.appPublicUrl,
    encrypted: encryptStoreCredential(plaintext, key),
    revision: randomUUID(),
    lastDeliveryAt: null,
    lastDeliveryStatus: null,
  }
  await database.transaction(async (transaction) => {
    await lockSyncNotifications(transaction, organizationId)
    const [existing] = await transaction
      .select()
      .from(syncWebhookDestinations)
      .where(eq(syncWebhookDestinations.organizationId, organizationId))
    if (
      existing?.appOrigin === input.appOrigin
      && matchesDestination(existing.encrypted, key, plaintext)
    ) {
      return
    }
    await transaction
      .delete(syncWebhookDeliveries)
      .where(eq(syncWebhookDeliveries.organizationId, organizationId))
    await transaction
      .insert(syncWebhookDestinations)
      .values({ organizationId, ...input })
      .onConflictDoUpdate({ target: syncWebhookDestinations.organizationId, set: input })
    await enqueueOpenIncidents(transaction, { organizationId, revision: input.revision })
  })
}

function webhookEncryptionKey() {
  return decodeStoreCredentialEncryptionKey(loadEncryptionConfig().appEncryptionKey)
}

function matchesDestination(
  encrypted: Parameters<typeof decryptStoreCredential>[0],
  key: Buffer,
  plaintext: string,
): boolean {
  try {
    return decryptStoreCredential(encrypted, key) === plaintext
  } catch {
    return false
  }
}

syncWebhookRoutes.delete(settingsPath, async (context) => {
  const session = await requireActiveOrganizationManagerSession(context)
  if (!session.ok) {
    return session.response
  }
  const { organizationId } = session.session
  await database.transaction(async (transaction) => {
    await lockSyncNotifications(transaction, organizationId)
    await transaction
      .delete(syncWebhookDestinations)
      .where(eq(syncWebhookDestinations.organizationId, organizationId))
  })
  return context.json(syncWebhookSettingsSchema.parse({ destination: null }))
})

const testingOrganizations = new Set<string>()
syncWebhookRoutes.post(`${settingsPath}/test`, async (context) => {
  const session = await requireActiveOrganizationManagerSession(context)
  if (!session.ok) {
    return session.response
  }
  const body = await parseJsonBody(context, syncWebhookInputSchema)
  if (!body.ok) {
    return body.response
  }
  if (!webhookUrl(body.data)) {
    return context.json({ errorCode: 'invalid_webhook_url' }, 400)
  }
  return sendTest(context, session.session.organizationId, () => Promise.resolve(body.data))
})

syncWebhookRoutes.post(`${settingsPath}/test-saved`, async (context) => {
  const session = await requireActiveOrganizationManagerSession(context)
  if (!session.ok) {
    return session.response
  }
  return sendTest(context, session.session.organizationId, () =>
    readDestination(session.session.organizationId),
  )
})

async function readDestination(organizationId: string): Promise<SyncWebhookInput | null> {
  const [row] = await database
    .select()
    .from(syncWebhookDestinations)
    .where(eq(syncWebhookDestinations.organizationId, organizationId))
  return row
    ? syncWebhookInputSchema.parse(
        JSON.parse(decryptStoreCredential(row.encrypted, webhookEncryptionKey())),
      )
    : null
}

async function sendTest(
  context: Context,
  organizationId: string,
  readInput: () => Promise<SyncWebhookInput | null>,
) {
  if (testingOrganizations.has(organizationId)) {
    return context.json({ errorCode: 'webhook_test_busy' }, 429)
  }
  testingOrganizations.add(organizationId)
  try {
    const input = await readInput()
    if (!input) {
      return context.json({ errorCode: 'webhook_not_configured' }, 404)
    }
    const status = await deliverSyncWebhook(
      input,
      {
        eventId: randomUUID(),
        type: 'sync.test',
        occurredAt: new Date().toISOString(),
        message: 'Test notification from ReviewInbox.',
      },
      serverConfig.appPublicUrl,
    )
    return status === 'delivered'
      ? context.json({ delivered: true })
      : context.json({ errorCode: 'webhook_test_failed' }, 422)
  } catch {
    return context.json({ errorCode: 'webhook_test_failed' }, 422)
  } finally {
    testingOrganizations.delete(organizationId)
  }
}

async function readSettings(organizationId: string) {
  const [row] = await database
    .select({
      kind: syncWebhookDestinations.kind,
      lastDeliveryAt: syncWebhookDestinations.lastDeliveryAt,
      lastDeliveryStatus: syncWebhookDestinations.lastDeliveryStatus,
    })
    .from(syncWebhookDestinations)
    .where(eq(syncWebhookDestinations.organizationId, organizationId))
  return syncWebhookSettingsSchema.parse({
    destination: row ? { ...row, lastDeliveryAt: row.lastDeliveryAt?.toISOString() ?? null } : null,
  })
}
