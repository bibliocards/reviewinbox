import { randomUUID } from 'node:crypto'

import {
  apps,
  type Database,
  storeConnections,
  storeSyncHealth,
  syncRuns,
  syncWebhookDeliveries,
  syncWebhookDestinations,
} from '@reviewinbox/db'
import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm'

import { getSafeSyncErrorMessage } from './sync-errors'

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]
type Run = typeof syncRuns.$inferSelect
type Health = typeof storeSyncHealth.$inferSelect
type Destination = Pick<typeof syncWebhookDestinations.$inferSelect, 'revision' | 'organizationId'>
type Incident = { storeConnectionId: string; incidentId: string; errorCode: string; openedAt: Date }

const temporaryErrors = new Set([
  'apple_rate_limited',
  'apple_unavailable',
  'google_rate_limited',
  'google_unavailable',
])

export function lockSyncNotifications(transaction: Transaction, organizationId: string) {
  return transaction.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${'sync-notifications:' + organizationId}, 0))`,
  )
}

export async function recordSyncHealth(transaction: Transaction, run: Run): Promise<void> {
  if (run.startedAt === null || run.finishedAt === null) {
    return
  }
  const [connection] = await transaction
    .select({ status: storeConnections.status })
    .from(storeConnections)
    .where(
      and(
        eq(storeConnections.id, run.storeConnectionId),
        eq(storeConnections.organizationId, run.organizationId),
      ),
    )
  if (connection?.status !== 'active') {
    return
  }
  const [previous] = await transaction
    .select()
    .from(storeSyncHealth)
    .where(eq(storeSyncHealth.storeConnectionId, run.storeConnectionId))
  if (previous && previous.lastRunStartedAt > run.startedAt) {
    return
  }
  const state = incidentStateForRun(run, run.startedAt, previous)
  await transaction
    .insert(storeSyncHealth)
    .values(state)
    .onConflictDoUpdate({ target: storeSyncHealth.storeConnectionId, set: state })
  await notifyTransition(
    transaction,
    { organizationId: run.organizationId, finishedAt: run.finishedAt },
    state,
    previous,
  )
}

async function notifyTransition(
  transaction: Transaction,
  run: { organizationId: string; finishedAt: Date },
  state: Health,
  previous: Health | undefined,
) {
  if (state.incidentId === (previous?.incidentId ?? null)) {
    return
  }
  const opened = state.incidentId !== null
  const incident = openIncident(opened ? state : previous)
  if (!incident) {
    return
  }
  const [destination] = await transaction
    .select({
      revision: syncWebhookDestinations.revision,
      organizationId: syncWebhookDestinations.organizationId,
    })
    .from(syncWebhookDestinations)
    .where(eq(syncWebhookDestinations.organizationId, run.organizationId))
  if (destination) {
    await enqueueIncident(transaction, destination, incident, opened ? null : run.finishedAt)
  }
}

function openIncident(state: Health | undefined): Incident | null {
  if (!state || state.incidentId === null || state.openedAt === null || state.errorCode === null) {
    return null
  }
  return {
    storeConnectionId: state.storeConnectionId,
    incidentId: state.incidentId,
    errorCode: state.errorCode,
    openedAt: state.openedAt,
  }
}

function incidentStateForRun(run: Run, startedAt: Date, previous?: Health): Health {
  const count = automaticFailureCount(run, previous?.consecutiveAutomaticFailures ?? 0)
  const incident = incidentForRun(run, count, openIncident(previous))
  return {
    storeConnectionId: run.storeConnectionId,
    lastRunStartedAt: startedAt,
    consecutiveAutomaticFailures: count,
    incidentId: incident?.incidentId ?? null,
    openedAt: incident?.openedAt ?? null,
    errorCode: incident?.errorCode ?? null,
  }
}

function automaticFailureCount(run: Run, previous: number): number {
  if (run.status === 'succeeded') {
    return 0
  }
  if (run.windowStartsAt === null) {
    return previous
  }
  return run.status === 'failed' ? Math.min(previous + 1, 2) : 0
}

function incidentForRun(run: Run, count: number, previous: Incident | null): Incident | null {
  if (run.status === 'succeeded') {
    return null
  }
  if (previous || run.status !== 'failed' || run.finishedAt === null) {
    return previous
  }
  const errorCode = run.errorCode ?? 'sync_failed'
  if (['store_connection_disabled', 'unsupported_store_provider'].includes(errorCode)) {
    return null
  }
  if (temporaryErrors.has(errorCode) && (run.windowStartsAt === null || count < 2)) {
    return null
  }
  return {
    storeConnectionId: run.storeConnectionId,
    incidentId: randomUUID(),
    openedAt: run.finishedAt,
    errorCode,
  }
}

export async function enqueueOpenIncidents(
  transaction: Transaction,
  destination: Destination,
): Promise<void> {
  await initializeUntrackedConnections(transaction, destination.organizationId)
  const states = await transaction
    .select({ health: storeSyncHealth })
    .from(storeSyncHealth)
    .innerJoin(storeConnections, eq(storeConnections.id, storeSyncHealth.storeConnectionId))
    .where(
      and(
        eq(storeConnections.organizationId, destination.organizationId),
        eq(storeConnections.status, 'active'),
        isNotNull(storeSyncHealth.incidentId),
      ),
    )
  await Promise.all(
    states.flatMap(({ health }) => {
      const incident = openIncident(health)
      return incident ? [enqueueIncident(transaction, destination, incident, null)] : []
    }),
  )
}

// Seed only the currently open incident; never emit historical transitions.
async function initializeUntrackedConnections(
  transaction: Transaction,
  organizationId: string,
): Promise<void> {
  const untracked = await transaction
    .select({ run: syncRuns })
    .from(syncRuns)
    .innerJoin(
      storeConnections,
      and(
        eq(storeConnections.id, syncRuns.storeConnectionId),
        eq(storeConnections.organizationId, organizationId),
      ),
    )
    .leftJoin(storeSyncHealth, eq(storeSyncHealth.storeConnectionId, syncRuns.storeConnectionId))
    .where(
      and(
        eq(syncRuns.organizationId, organizationId),
        eq(storeConnections.status, 'active'),
        sql`${storeSyncHealth.storeConnectionId} is null`,
        inArray(syncRuns.status, ['failed', 'partial']),
        sql`not exists (
          select 1 from sync_runs as successful
          where successful.organization_id = ${syncRuns.organizationId}
            and successful.store_connection_id = ${syncRuns.storeConnectionId}
            and successful.status = 'succeeded'
            and successful.started_at >= ${syncRuns.startedAt}
        )`,
      ),
    )
    .orderBy(syncRuns.storeConnectionId, asc(syncRuns.startedAt), asc(syncRuns.id))
  const reconstructed = new Map<string, Health>()
  for (const { run } of untracked) {
    if (run.startedAt !== null && run.finishedAt !== null) {
      const previous = reconstructed.get(run.storeConnectionId)
      reconstructed.set(run.storeConnectionId, incidentStateForRun(run, run.startedAt, previous))
    }
  }
  const states = [...reconstructed.values()]
  if (states.length > 0) {
    await transaction.insert(storeSyncHealth).values(states).onConflictDoNothing()
  }
}

async function enqueueIncident(
  transaction: Transaction,
  destination: Destination,
  incident: Incident,
  resolvedAt: Date | null,
): Promise<void> {
  const connection = await selectIncidentApp(
    transaction,
    destination.organizationId,
    incident.storeConnectionId,
  )
  if (!connection) {
    return
  }
  const lastSuccessfulSyncAt = await selectLastSuccessfulSync(
    transaction,
    destination.organizationId,
    incident.storeConnectionId,
  )
  const eventId = randomUUID()
  await transaction
    .insert(syncWebhookDeliveries)
    .values({
      id: eventId,
      organizationId: destination.organizationId,
      destinationRevision: destination.revision,
      nextAttemptAt: new Date(),
      payload: {
        eventId,
        type: resolvedAt ? 'sync.incident.resolved' : 'sync.incident.opened',
        occurredAt: (resolvedAt ?? incident.openedAt).toISOString(),
        incidentId: incident.incidentId,
        ...connection,
        storeConnectionId: incident.storeConnectionId,
        errorCode: incident.errorCode,
        message: resolvedAt
          ? 'Review synchronization has recovered.'
          : getSafeSyncErrorMessage(incident.errorCode),
        lastSuccessfulSyncAt,
        appPath: `/apps#store-${incident.storeConnectionId}`,
      },
    })
}

async function selectIncidentApp(
  transaction: Transaction,
  organizationId: string,
  storeConnectionId: string,
) {
  const [connection] = await transaction
    .select({ appName: apps.name, appId: apps.id, store: storeConnections.provider })
    .from(storeConnections)
    .innerJoin(
      apps,
      and(eq(apps.id, storeConnections.appId), eq(apps.organizationId, organizationId)),
    )
    .where(
      and(
        eq(storeConnections.id, storeConnectionId),
        eq(storeConnections.organizationId, organizationId),
      ),
    )
  return connection
}

async function selectLastSuccessfulSync(
  transaction: Transaction,
  organizationId: string,
  storeConnectionId: string,
) {
  const [lastSuccess] = await transaction
    .select({ finishedAt: syncRuns.finishedAt })
    .from(syncRuns)
    .where(
      and(
        eq(syncRuns.organizationId, organizationId),
        eq(syncRuns.storeConnectionId, storeConnectionId),
        eq(syncRuns.status, 'succeeded'),
      ),
    )
    .orderBy(desc(syncRuns.finishedAt))
    .limit(1)
  return lastSuccess?.finishedAt?.toISOString() ?? null
}
