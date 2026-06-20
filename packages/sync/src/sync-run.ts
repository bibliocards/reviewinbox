import { type Database, storeConnections, storeCredentials, syncRuns } from '@reviewinbox/db'
import { AppleStoreAdapterError, GooglePlayStoreAdapterError } from '@reviewinbox/store-adapters'
import { and, desc, eq } from 'drizzle-orm'

import { decryptStoreCredentialPlaintext } from './credentials'
import { syncAppleReviews, syncGoogleReviews } from './provider-sync'
import { storeSyncedReviews } from './review-storage'
import { getSafeSyncErrorMessage, SyncRunFailureError, SyncStoreConnectionNotFoundError } from './sync-errors'
import { type SyncRunResult, toSyncRunResult } from './sync-run-result'

export type { SyncRunResult } from './sync-run-result'

export type SyncReviewsForStoreConnectionInput = {
  database: Database
  organizationId: string
  storeConnectionId: string
  maxPages?: number
}

export async function syncReviewsForStoreConnection(input: SyncReviewsForStoreConnectionInput): Promise<SyncRunResult> {
  const row = await input.database
    .select({ connection: storeConnections, credential: storeCredentials })
    .from(storeConnections)
    .leftJoin(storeCredentials, eq(storeCredentials.storeConnectionId, storeConnections.id))
    .where(and(eq(storeConnections.id, input.storeConnectionId), eq(storeConnections.organizationId, input.organizationId)))
    .limit(1)

  const scoped = row[0]
  if (!scoped) {
    throw new SyncStoreConnectionNotFoundError()
  }

  const [createdRun] = await input.database
    .insert(syncRuns)
    .values({
      organizationId: scoped.connection.organizationId,
      appId: scoped.connection.appId,
      storeConnectionId: scoped.connection.id,
      status: 'running',
      startedAt: new Date(),
    })
    .returning()

  if (!createdRun) {
    throw new Error('Sync Run creation did not return a row.')
  }

  try {
    if (scoped.connection.status !== 'active') {
      return await failSyncRun(input.database, createdRun.id, 'store_connection_disabled')
    }
    if (!['apple_app_store', 'google_play'].includes(scoped.connection.provider)) {
      return await failSyncRun(input.database, createdRun.id, 'unsupported_store_provider')
    }
    if (!scoped.connection.externalAppId) {
      return await failSyncRun(input.database, createdRun.id, 'missing_external_app_id')
    }
    if (!scoped.credential) {
      return await failSyncRun(input.database, createdRun.id, 'missing_credential')
    }

    const lastRun = await input.database.query.syncRuns.findFirst({
      where: and(eq(syncRuns.storeConnectionId, scoped.connection.id), eq(syncRuns.status, 'succeeded')),
      orderBy: [desc(syncRuns.finishedAt)],
    })

    const credentialPlaintext = decryptStoreCredentialPlaintext(scoped.credential)
    const checkpoint = (lastRun?.checkpoint as Record<string, unknown> | null | undefined) ?? null
    const result =
      scoped.connection.provider === 'apple_app_store'
        ? await syncAppleReviews({
            appStoreAppId: scoped.connection.externalAppId,
            credentialPlaintext,
            checkpoint,
            ...(input.maxPages !== undefined ? { maxPages: input.maxPages } : {}),
          })
        : await syncGoogleReviews({
            packageName: scoped.connection.externalAppId,
            credentialPlaintext,
            checkpoint,
            ...(input.maxPages !== undefined ? { maxPages: input.maxPages } : {}),
          })

    const storedReviews = await storeSyncedReviews(
      input.database,
      {
        organizationId: scoped.connection.organizationId,
        appId: scoped.connection.appId,
        storeConnectionId: scoped.connection.id,
      },
      result.reviews,
    )

    const [updatedRun] = await input.database
      .update(syncRuns)
      .set({
        status: 'succeeded',
        finishedAt: new Date(),
        fetchedCount: result.reviews.length,
        storedCount: storedReviews.storedCount,
        checkpoint: result.checkpoint,
      })
      .where(eq(syncRuns.id, createdRun.id))
      .returning()

    if (!updatedRun) {
      throw new Error('Sync Run update did not return a row.')
    }

    return { ...toSyncRunResult(updatedRun), newReviewIds: storedReviews.newReviewIds }
  } catch (error) {
    const code =
      error instanceof AppleStoreAdapterError || error instanceof GooglePlayStoreAdapterError || error instanceof SyncRunFailureError
        ? error.code
        : 'sync_failed'
    return await failSyncRun(input.database, createdRun.id, code)
  }
}

async function failSyncRun(database: Database, syncRunId: string, errorCode: string): Promise<SyncRunResult> {
  const [updatedRun] = await database
    .update(syncRuns)
    .set({
      status: 'failed',
      finishedAt: new Date(),
      errorCode,
      errorMessage: getSafeSyncErrorMessage(errorCode),
    })
    .where(eq(syncRuns.id, syncRunId))
    .returning()

  if (!updatedRun) {
    throw new Error('Sync Run failure update did not return a row.')
  }

  return toSyncRunResult(updatedRun)
}
