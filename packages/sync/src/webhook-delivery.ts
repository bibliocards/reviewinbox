import { loadEncryptionConfig } from '@reviewinbox/config'
import { syncWebhookInputSchema } from '@reviewinbox/contracts'
import { decodeStoreCredentialEncryptionKey, decryptStoreCredential } from '@reviewinbox/core'
import { type Database, syncWebhookDeliveries, syncWebhookDestinations } from '@reviewinbox/db'
import { and, asc, eq, lte, sql } from 'drizzle-orm'

import { deliverSyncWebhook } from './webhook-transport'

const retryDelays = [60_000, 300_000, 900_000, 3_600_000]
type Delivery = typeof syncWebhookDeliveries.$inferSelect
type Status = Awaited<ReturnType<typeof deliverSyncWebhook>>

export async function deliverNextSyncWebhook(database: Database): Promise<boolean> {
  const claimed = await claimDelivery(database)
  if (!claimed) {
    return false
  }
  const status = await sendDelivery(database, claimed)
  await finishDelivery(database, claimed, status)
  return true
}

async function sendDelivery(database: Database, claimed: Delivery): Promise<Status> {
  const [destination] = await database
    .select()
    .from(syncWebhookDestinations)
    .where(
      and(
        eq(syncWebhookDestinations.organizationId, claimed.organizationId),
        eq(syncWebhookDestinations.revision, claimed.destinationRevision),
      ),
    )
  if (!destination || claimed.attempts > retryDelays.length + 1) {
    return 'failed'
  }
  try {
    const key = decodeStoreCredentialEncryptionKey(loadEncryptionConfig().appEncryptionKey)
    const input = syncWebhookInputSchema.parse(
      JSON.parse(decryptStoreCredential(destination.encrypted, key)),
    )
    return await deliverSyncWebhook(input, claimed.payload, destination.appOrigin)
  } catch {
    // Never log decrypted settings or transport errors containing the destination.
    return 'failed'
  }
}

async function finishDelivery(
  database: Database,
  claimed: Delivery,
  status: Status,
): Promise<void> {
  const retryDelay = retryDelays[claimed.attempts - 1]
  const result = status === 'retrying' && retryDelay === undefined ? 'failed' : status
  await database.transaction(async (transaction) => {
    const match = and(
      eq(syncWebhookDeliveries.id, claimed.id),
      eq(syncWebhookDeliveries.attempts, claimed.attempts),
    )
    const changes =
      status === 'retrying' && retryDelay !== undefined
        ? await transaction
            .update(syncWebhookDeliveries)
            .set({ nextAttemptAt: new Date(Date.now() + retryDelay) })
            .where(match)
            .returning({ id: syncWebhookDeliveries.id })
        : await transaction
            .delete(syncWebhookDeliveries)
            .where(match)
            .returning({ id: syncWebhookDeliveries.id })
    if (changes.length > 0) {
      await transaction
        .update(syncWebhookDestinations)
        .set({ lastDeliveryAt: new Date(), lastDeliveryStatus: result })
        .where(
          and(
            eq(syncWebhookDestinations.organizationId, claimed.organizationId),
            eq(syncWebhookDestinations.revision, claimed.destinationRevision),
          ),
        )
    }
  })
}

function claimDelivery(database: Database) {
  return database.transaction(async (transaction) => {
    const [delivery] = await transaction
      .select()
      .from(syncWebhookDeliveries)
      .where(
        and(
          lte(syncWebhookDeliveries.nextAttemptAt, new Date()),
          sql`not exists (
        select 1 from sync_webhook_deliveries as earlier
        where earlier.organization_id = ${syncWebhookDeliveries.organizationId}
          and earlier.destination_revision = ${syncWebhookDeliveries.destinationRevision}
          and (earlier.created_at, earlier.id) < (${syncWebhookDeliveries.createdAt}, ${syncWebhookDeliveries.id})
      )`,
        ),
      )
      .orderBy(asc(syncWebhookDeliveries.nextAttemptAt))
      .limit(1)
      .for('update', { skipLocked: true })
    if (!delivery) {
      return null
    }
    const [claimed] = await transaction
      .update(syncWebhookDeliveries)
      .set({ attempts: delivery.attempts + 1, nextAttemptAt: new Date(Date.now() + 60_000) })
      .where(eq(syncWebhookDeliveries.id, delivery.id))
      .returning()
    return claimed ?? null
  })
}
