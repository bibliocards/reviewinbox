import { type Database, reviews, storeConnections } from '@reviewinbox/db'
import { enrichAppleReviewVersions } from '@reviewinbox/sync'
import { and, eq, isNotNull, or, sql } from 'drizzle-orm'

/** One coalesced scan per worker; database locks also exclude other replicas. */
export function startAppleVersionScanner(database: Database, onError: () => void) {
  const controller = new AbortController()
  let active: Promise<void> | null = null
  let requested = false
  const wake = () => {
    requested = true
    if (active !== null || controller.signal.aborted) {
      return
    }
    active = drain()
      .catch(() => {
        onError()
      })
      .finally(() => {
        active = null
      })
  }
  const drain = async () => {
    while (requested && !controller.signal.aborted) {
      requested = false
      // oxlint-disable-next-line no-await-in-loop -- Coalesce triggers without overlapping scans.
      await scanConnections(database, controller.signal, onError)
    }
  }
  const timer = setInterval(wake, 60_000)
  wake()
  return {
    wake,
    stop: async () => {
      clearInterval(timer)
      controller.abort()
      await active
    },
  }
}

async function scanConnections(database: Database, signal: AbortSignal, onError: () => void) {
  const connections = await database
    .select({
      organizationId: storeConnections.organizationId,
      storeConnectionId: storeConnections.id,
    })
    .from(storeConnections)
    .where(
      and(
        eq(storeConnections.provider, 'apple_app_store'),
        eq(storeConnections.status, 'active'),
        or(
          isNotNull(storeConnections.appleVersionLookup),
          sql`exists (select 1 from ${reviews} where ${reviews.storeConnectionId} = ${storeConnections.id} and ${reviews.versionLookupStatus} = 'pending')`,
        ),
      ),
    )
  for (const connection of connections) {
    if (signal.aborted) {
      return
    }
    try {
      // oxlint-disable-next-line no-await-in-loop -- Avoid competing for Apple API quota across connections.
      await enrichAppleReviewVersions({ database, ...connection, signal })
    } catch {
      if (!signal.aborted) {
        onError()
      }
    }
  }
}
