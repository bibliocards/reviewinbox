import { getMonthlyUsagePeriod } from '@reviewinbox/billing'
import {
  type Database,
  organization,
  storeConnections,
  storeCredentials,
  syncRuns,
  usageEvents,
} from '@reviewinbox/db'
import {
  AppleStoreAdapterError,
  GooglePlayStoreAdapterError,
  reviewSyncCheckpointSchema,
  type ReviewSyncCheckpoint,
} from '@reviewinbox/store-adapters'
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm'

import { decryptStoreCredentialPlaintext } from './credentials'
import { syncAppleReviews, syncGoogleReviews } from './provider-sync'
import { storeSyncedReviews } from './review-storage'
import {
  getSafeSyncErrorMessage,
  SyncRunFailureError,
  SyncStoreConnectionNotFoundError,
} from './sync-errors'
import { type SyncRunResult, toSyncRunResult } from './sync-run-result'

export type { SyncRunResult } from './sync-run-result'

export type SyncReviewsForStoreConnectionInput = {
  database: Database
  organizationId: string
  storeConnectionId: string
  deploymentMode: 'self-hosted' | 'cloud'
  /** The fixed UTC window for an automatic worker run. */
  windowStartsAt?: Date
  maxPages?: number
}

type ScopedStoreConnection = {
  connection: typeof storeConnections.$inferSelect
  credential: typeof storeCredentials.$inferSelect | null
}
type CreatedSyncRun = typeof syncRuns.$inferSelect

export async function syncReviewsForStoreConnection(
  input: SyncReviewsForStoreConnectionInput,
): Promise<SyncRunResult> {
  const scoped = await loadScopedStoreConnection(input)
  const createdRun = await createSyncRun(input, scoped)
  try {
    return await runSync(input, scoped, createdRun)
  } catch (error) {
    const code =
      error instanceof AppleStoreAdapterError
      || error instanceof GooglePlayStoreAdapterError
      || error instanceof SyncRunFailureError
        ? error.code
        : 'sync_failed'
    return failSyncRun(input.database, createdRun.id, code)
  }
}

async function loadScopedStoreConnection(
  input: SyncReviewsForStoreConnectionInput,
): Promise<ScopedStoreConnection> {
  const [scoped] = await input.database
    .select({ connection: storeConnections, credential: storeCredentials })
    .from(storeConnections)
    .leftJoin(storeCredentials, eq(storeCredentials.storeConnectionId, storeConnections.id))
    .where(
      and(
        eq(storeConnections.id, input.storeConnectionId),
        eq(storeConnections.organizationId, input.organizationId),
      ),
    )
    .limit(1)
  if (scoped === undefined) {
    throw new SyncStoreConnectionNotFoundError()
  }
  return scoped
}

async function createSyncRun(
  input: SyncReviewsForStoreConnectionInput,
  scoped: ScopedStoreConnection,
): Promise<CreatedSyncRun> {
  const [createdRun] = await input.database
    .insert(syncRuns)
    .values({
      organizationId: scoped.connection.organizationId,
      appId: scoped.connection.appId,
      storeConnectionId: scoped.connection.id,
      windowStartsAt: input.windowStartsAt ?? null,
      status: 'running',
      startedAt: new Date(),
    })
    .returning()
  if (createdRun === undefined) {
    throw new Error('Sync Run creation did not return a row.')
  }
  return createdRun
}

async function runSync(
  input: SyncReviewsForStoreConnectionInput,
  scoped: ScopedStoreConnection,
  createdRun: CreatedSyncRun,
): Promise<SyncRunResult> {
  const validationError = getSyncValidationError(scoped)
  if (validationError !== null) {
    return failSyncRun(input.database, createdRun.id, validationError)
  }

  const result = await getProviderSyncResult(input, scoped)
  const billing = await loadBillingUsage(input.database, scoped.connection.organizationId)
  if (billing === null) {
    return failSyncRun(input.database, createdRun.id, 'organization_not_found')
  }

  const storedReviews = await storeReviewsForSync(input, scoped, result, billing)
  return completeSyncRun(input.database, createdRun.id, result, storedReviews)
}

function getSyncValidationError(scoped: ScopedStoreConnection): string | null {
  if (scoped.connection.status !== 'active') {
    return 'store_connection_disabled'
  }
  if (!['apple_app_store', 'google_play'].includes(scoped.connection.provider)) {
    return 'unsupported_store_provider'
  }
  if (scoped.connection.externalAppId === null || scoped.connection.externalAppId.length === 0) {
    return 'missing_external_app_id'
  }
  if (scoped.credential === null) {
    return 'missing_credential'
  }
  return null
}

async function getProviderSyncResult(
  input: SyncReviewsForStoreConnectionInput,
  scoped: ScopedStoreConnection,
) {
  const lastRun = await input.database.query.syncRuns.findFirst({
    where: and(
      eq(syncRuns.storeConnectionId, scoped.connection.id),
      eq(syncRuns.status, 'succeeded'),
    ),
    orderBy: [desc(syncRuns.finishedAt)],
  })
  const checkpointResult = reviewSyncCheckpointSchema.safeParse(lastRun?.checkpoint)
  const checkpoint = checkpointResult.success ? checkpointResult.data : null
  if (scoped.credential === null) {
    throw new SyncRunFailureError('missing_credential')
  }
  const credentialPlaintext = decryptStoreCredentialPlaintext(scoped.credential)
  return syncReviewsForProvider(input, scoped, credentialPlaintext, checkpoint)
}

function syncReviewsForProvider(
  input: SyncReviewsForStoreConnectionInput,
  scoped: ScopedStoreConnection,
  credentialPlaintext: string,
  checkpoint: ReviewSyncCheckpoint | null,
) {
  if (scoped.connection.externalAppId === null || scoped.connection.externalAppId.length === 0) {
    throw new SyncRunFailureError('missing_external_app_id')
  }
  if (scoped.connection.provider === 'apple_app_store') {
    const request: Parameters<typeof syncAppleReviews>[0] = {
      appStoreAppId: scoped.connection.externalAppId,
      credentialPlaintext,
      checkpoint,
    }
    if (input.maxPages !== undefined) {
      request.maxPages = input.maxPages
    }
    return syncAppleReviews(request)
  }
  const request: Parameters<typeof syncGoogleReviews>[0] = {
    packageName: scoped.connection.externalAppId,
    credentialPlaintext,
    checkpoint,
  }
  if (input.maxPages !== undefined) {
    request.maxPages = input.maxPages
  }
  return syncGoogleReviews(request)
}

function storeReviewsForSync(
  input: SyncReviewsForStoreConnectionInput,
  scoped: ScopedStoreConnection,
  result: Awaited<ReturnType<typeof syncAppleReviews>>,
  billing: NonNullable<Awaited<ReturnType<typeof loadBillingUsage>>>,
) {
  return storeSyncedReviews(
    input.database,
    {
      organizationId: scoped.connection.organizationId,
      appId: scoped.connection.appId,
      storeConnectionId: scoped.connection.id,
    },
    result.reviews,
    {
      context: {
        deploymentMode: input.deploymentMode,
        planName: billing.planName,
        overrides: billing.billingOverrides,
      },
      monthlyImportedReviewCount: billing.monthlyImportedReviewCount,
    },
  )
}

async function loadBillingUsage(database: Database, organizationId: string) {
  const usagePeriod = getMonthlyUsagePeriod()
  const billingOrganization = await database.query.organization.findFirst({
    columns: { planName: true, billingOverrides: true },
    where: eq(organization.id, organizationId),
  })
  if (billingOrganization === undefined) {
    return null
  }
  const [monthlyReviewImports] = await database
    .select({ quantity: sql<number>`coalesce(sum(${usageEvents.quantity}), 0)::int` })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.organizationId, organizationId),
        eq(usageEvents.type, 'review_imported'),
        gte(usageEvents.occurredAt, usagePeriod.startsAt),
        lt(usageEvents.occurredAt, usagePeriod.endsAt),
      ),
    )
  return {
    planName: billingOrganization.planName,
    billingOverrides: billingOrganization.billingOverrides,
    monthlyImportedReviewCount: monthlyReviewImports?.quantity ?? 0,
  }
}

async function completeSyncRun(
  database: Database,
  syncRunId: string,
  result: Awaited<ReturnType<typeof syncAppleReviews>>,
  storedReviews: Awaited<ReturnType<typeof storeSyncedReviews>>,
): Promise<SyncRunResult> {
  const [updatedRun] = await database
    .update(syncRuns)
    .set({
      status: storedReviews.limitReached ? 'partial' : 'succeeded',
      finishedAt: new Date(),
      fetchedCount: result.reviews.length,
      storedCount: storedReviews.storedCount,
      errorCode: storedReviews.limitReached ? 'monthly_review_import_cap_reached' : null,
      errorMessage: storedReviews.limitReached
        ? getSafeSyncErrorMessage('monthly_review_import_cap_reached')
        : null,
      checkpoint: result.checkpoint,
    })
    .where(eq(syncRuns.id, syncRunId))
    .returning()
  if (updatedRun === undefined) {
    throw new Error('Sync Run update did not return a row.')
  }
  return { ...toSyncRunResult(updatedRun), newReviewIds: storedReviews.newReviewIds }
}

async function failSyncRun(
  database: Database,
  syncRunId: string,
  errorCode: string,
): Promise<SyncRunResult> {
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
  if (updatedRun === undefined) {
    throw new Error('Sync Run failure update did not return a row.')
  }
  return toSyncRunResult(updatedRun)
}
