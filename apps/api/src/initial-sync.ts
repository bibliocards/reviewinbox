import { type Database, syncRuns } from '@reviewinbox/db'
import type { QueueClient } from '@reviewinbox/queue'
import { and, desc, eq, or } from 'drizzle-orm'

export type InitialSyncConnection = {
  storeConnectionId: string
  /** Timestamp identifying the verified credential, activation, or identifier revision. */
  revisionAt: Date | string
}

export type InitialSyncEnqueueResult = {
  status: 'not_requested' | 'queued' | 'partial' | 'failed'
  queuedStoreConnectionIds: string[]
  failedStoreConnectionIds: string[]
}

/**
 * A Store Connection still needs its initial Sync Run until a settled run was
 * recorded after the credential, activation, or identifier revision.
 */
export function shouldQueueInitialStoreConnectionSync(input: {
  revisionAt: Date | string
  latestSettledAt: Date | string | null | undefined
}): boolean {
  const revisionAt = toDate(input.revisionAt)
  if (!revisionAt) {
    return false
  }

  if (!input.latestSettledAt) {
    return true
  }

  const latestSettledAt = toDate(input.latestSettledAt)
  return latestSettledAt === null || latestSettledAt.getTime() < revisionAt.getTime()
}

export function latestStoreConnectionSyncRevisionAt(input: {
  connectionUpdatedAt: Date | string
  credentialUpdatedAt: Date | string | null | undefined
}): Date {
  const connectionRevision = toDate(input.connectionUpdatedAt)
  if (!connectionRevision) {
    throw new Error('Store Connection sync requires a valid connection revision timestamp.')
  }

  const credentialRevision = input.credentialUpdatedAt ? toDate(input.credentialUpdatedAt) : null
  return credentialRevision && credentialRevision.getTime() > connectionRevision.getTime() ? credentialRevision : connectionRevision
}

export async function selectLatestSettledStoreConnectionSyncStartedAt(
  database: Database,
  input: { storeConnectionId: string; organizationId: string },
): Promise<Date | null> {
  const [syncRun] = await database
    .select({ startedAt: syncRuns.startedAt })
    .from(syncRuns)
    .where(
      and(
        eq(syncRuns.storeConnectionId, input.storeConnectionId),
        eq(syncRuns.organizationId, input.organizationId),
        or(eq(syncRuns.status, 'succeeded'), eq(syncRuns.status, 'partial'), eq(syncRuns.status, 'failed')),
      ),
    )
    .orderBy(desc(syncRuns.startedAt))
    .limit(1)

  return syncRun?.startedAt ?? null
}

type SyncQueue = Pick<QueueClient, 'enqueueSyncStoreConnection'>

/**
 * Queue the first import for each verified Store Connection.
 *
 * The verified credential or activation revision timestamp is used as the sync
 * window identifier. Repeating this call for the same revision therefore
 * reuses pg-boss's existing singleton key, while a new credential or
 * activation gets a fresh job even when the previous job failed.
 */
export async function enqueueInitialStoreConnectionSync(input: {
  queue: SyncQueue
  organizationId: string
  connections: InitialSyncConnection[]
}): Promise<InitialSyncEnqueueResult> {
  const connections = uniqueConnections(input.connections)
  if (connections.length === 0) {
    return {
      status: 'not_requested',
      queuedStoreConnectionIds: [],
      failedStoreConnectionIds: [],
    }
  }

  const queuedStoreConnectionIds: string[] = []
  const failedStoreConnectionIds: string[] = []

  for (const connection of connections) {
    try {
      await input.queue.enqueueSyncStoreConnection({
        organizationId: input.organizationId,
        storeConnectionId: connection.storeConnectionId,
        windowStartsAt: toIsoDateTime(connection.revisionAt),
        trigger: 'initial',
      })
      queuedStoreConnectionIds.push(connection.storeConnectionId)
    } catch {
      failedStoreConnectionIds.push(connection.storeConnectionId)
    }
  }

  return {
    status: failedStoreConnectionIds.length === 0 ? 'queued' : queuedStoreConnectionIds.length === 0 ? 'failed' : 'partial',
    queuedStoreConnectionIds,
    failedStoreConnectionIds,
  }
}

function uniqueConnections(connections: InitialSyncConnection[]): InitialSyncConnection[] {
  const seen = new Set<string>()
  return connections.filter((connection) => {
    if (seen.has(connection.storeConnectionId)) {
      return false
    }
    seen.add(connection.storeConnectionId)
    return true
  })
}

function toIsoDateTime(value: Date | string): string {
  const date = toDate(value)
  if (!date) {
    throw new Error('Initial Store Connection sync requires a valid revision timestamp.')
  }
  return date.toISOString()
}

function toDate(value: Date | string): Date | null {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}
