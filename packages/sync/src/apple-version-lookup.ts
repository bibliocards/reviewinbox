import { randomUUID } from 'node:crypto'

import { type Database, reviews, storeConnections, storeCredentials } from '@reviewinbox/db'
import {
  appleCredentialQuotaKey,
  appleVersionLookupCursorSchema,
  AppleVersionQuotaError,
  createAppleVersionLookupCursor,
  readAppleVersionLookupPage,
  type AppleAppStoreCredential,
  type AppleVersionMatch,
} from '@reviewinbox/store-adapters'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'

import { decryptStoreCredentialPlaintext, parseAppleCredentialPlaintext } from './credentials'

const scanSchema = z.object({
  scanId: z.uuid(),
  appId: z.string(),
  cursor: appleVersionLookupCursorSchema,
  retryAt: z.number(),
})
type Scan = z.infer<typeof scanSchema>
type Input = {
  database: Database
  organizationId: string
  storeConnectionId: string
  signal?: AbortSignal
}
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

export function enrichAppleReviewVersions(input: Input): Promise<void> {
  return withLookupLock(
    input.database,
    `apple-version-connection:${input.storeConnectionId}`,
    async () => {
      const scoped = await loadConnection(input)
      if (scoped === undefined || scoped.connection.externalAppId === null) {
        return
      }
      const parsed = parseAppleCredentialPlaintext(
        decryptStoreCredentialPlaintext(scoped.credential),
      )
      if (!parsed.ok) {
        return
      }
      await withLookupLock(
        input.database,
        `apple-version-key:${appleCredentialQuotaKey(parsed.credential)}`,
        () => runLookup(input, scoped.connection, parsed.credential),
      )
    },
  )
}

async function withLookupLock(
  database: Database,
  key: string,
  run: () => Promise<void>,
): Promise<void> {
  const client = await database.$client.connect()
  let locked = false
  try {
    const result = await client.query<{ locked: boolean }>(
      'select pg_try_advisory_lock(hashtextextended($1,0)) as locked',
      [key],
    )
    locked = result.rows[0]?.locked === true
    if (locked) {
      await run()
    }
  } finally {
    try {
      if (locked) {
        await client.query('select pg_advisory_unlock(hashtextextended($1,0))', [key])
      }
    } finally {
      client.release()
    }
  }
}

function loadConnection(input: Input) {
  return input.database
    .select({ connection: storeConnections, credential: storeCredentials })
    .from(storeConnections)
    .innerJoin(storeCredentials, eq(storeCredentials.storeConnectionId, storeConnections.id))
    .where(
      and(
        connectionScope(input),
        eq(storeConnections.provider, 'apple_app_store'),
        eq(storeConnections.status, 'active'),
      ),
    )
    .limit(1)
    .then((rows) => rows[0])
}
function connectionScope(input: Input) {
  return and(
    eq(storeConnections.id, input.storeConnectionId),
    eq(storeConnections.organizationId, input.organizationId),
  )
}
function reviewScope(input: Input) {
  return and(
    eq(reviews.storeConnectionId, input.storeConnectionId),
    eq(reviews.organizationId, input.organizationId),
  )
}
function scanScope(input: Input, scan: Scan) {
  return and(
    reviewScope(input),
    eq(reviews.versionLookupScanId, scan.scanId),
    eq(reviews.versionLookupStatus, 'pending'),
  )
}

function startScan(
  input: Input,
  connection: typeof storeConnections.$inferSelect,
): Promise<Scan | null> {
  const existing = scanSchema.safeParse(connection.appleVersionLookup)
  if (existing.success && existing.data.appId === connection.externalAppId) {
    return Promise.resolve(existing.data)
  }
  if (connection.externalAppId === null) {
    return Promise.resolve(null)
  }
  const scan: Scan = {
    scanId: randomUUID(),
    appId: connection.externalAppId,
    cursor: createAppleVersionLookupCursor(connection.externalAppId),
    retryAt: 0,
  }
  return input.database.transaction(async (tx) => {
    const targets = await tx
      .update(reviews)
      .set({ versionLookupScanId: scan.scanId })
      .where(and(reviewScope(input), eq(reviews.versionLookupStatus, 'pending')))
      .returning({ id: reviews.id })
    if (targets.length === 0) {
      return null
    }
    await tx
      .update(storeConnections)
      .set({ appleVersionLookup: scan })
      .where(connectionScope(input))
    return scan
  })
}

async function runLookup(
  input: Input,
  connection: typeof storeConnections.$inferSelect,
  credential: AppleAppStoreCredential,
): Promise<void> {
  let scan = await startScan(input, connection)
  if (scan === null || scan.retryAt > Date.now()) {
    return
  }
  try {
    while (scan !== null) {
      // oxlint-disable-next-line no-await-in-loop -- Each page uses the cursor persisted by the previous one.
      scan = await advanceScan(input, scan, credential)
    }
  } catch (error) {
    if (scan !== null) {
      await input.database
        .update(storeConnections)
        .set({
          appleVersionLookup: {
            ...scan,
            retryAt:
              error instanceof AppleVersionQuotaError ? error.retryAt : Date.now() + 5 * 60_000,
          },
        })
        .where(connectionScope(input))
    }
    throw error
  }
}

async function advanceScan(
  input: Input,
  scan: Scan,
  credential: AppleAppStoreCredential,
): Promise<Scan | null> {
  input.signal?.throwIfAborted()
  const targets = await input.database
    .select({ id: reviews.id })
    .from(reviews)
    .where(scanScope(input, scan))
    .limit(1)
  if (targets.length === 0) {
    await finishScan(input, scan)
    return null
  }
  const request: Parameters<typeof readAppleVersionLookupPage>[0] = {
    credential,
    cursor: scan.cursor,
  }
  if (input.signal !== undefined) {
    request.signal = input.signal
  }
  return savePage(input, scan, await readAppleVersionLookupPage(request))
}

function savePage(
  input: Input,
  scan: Scan,
  page: Awaited<ReturnType<typeof readAppleVersionLookupPage>>,
): Promise<Scan | null> {
  return input.database.transaction(async (tx) => {
    const targets = await tx
      .select({ externalReviewId: reviews.externalReviewId })
      .from(reviews)
      .where(scanScope(input, scan))
    const ids = new Set(targets.map((target) => target.externalReviewId))
    for (const match of page.matches.filter((candidate) => ids.has(candidate.externalReviewId))) {
      // oxlint-disable-next-line no-await-in-loop -- PostgreSQL transactions use one connection; apply matches serially.
      await saveMatch(tx, input, scan, match)
    }
    if (page.cursor === null) {
      await finishScan(input, scan, tx)
      return null
    }
    const next = { ...scan, cursor: page.cursor, retryAt: 0 }
    await tx
      .update(storeConnections)
      .set({ appleVersionLookup: next })
      .where(connectionScope(input))
    return next
  })
}

async function saveMatch(tx: Transaction, input: Input, scan: Scan, match: AppleVersionMatch) {
  const scope = and(scanScope(input, scan), eq(reviews.externalReviewId, match.externalReviewId))
  const sameContent = sql`${reviews.title} IS NOT DISTINCT FROM ${match.title} AND ${reviews.body} = ${match.body} AND ${reviews.rating} = ${match.rating}`
  const versionChanged = sql`${reviews.version} IS DISTINCT FROM ${match.version}`
  await tx
    .update(reviews)
    .set({
      version: match.version,
      versionLookupStatus: 'resolved',
      versionLookupScanId: null,
      analysisStatus: sql`CASE WHEN ${versionChanged} THEN 'pending' ELSE ${reviews.analysisStatus} END`,
      analysisStartedAt: sql`CASE WHEN ${versionChanged} THEN NULL ELSE ${reviews.analysisStartedAt} END`,
      analysisFailureCode: sql`CASE WHEN ${versionChanged} THEN NULL ELSE ${reviews.analysisFailureCode} END`,
    })
    .where(and(scope, sameContent))
  // Apple may already have an edit that the normal ingestion has not seen yet.
  await tx
    .update(reviews)
    .set({ versionLookupScanId: null })
    .where(and(scope, sql`NOT (${sameContent})`))
}

async function finishScan(input: Input, scan: Scan, tx: Database | Transaction = input.database) {
  await tx
    .update(reviews)
    .set({
      version: null,
      versionLookupStatus: 'unavailable',
      versionLookupScanId: null,
      analysisStatus: sql`CASE WHEN ${reviews.version} IS NOT NULL THEN 'pending' ELSE ${reviews.analysisStatus} END`,
      analysisStartedAt: sql`CASE WHEN ${reviews.version} IS NOT NULL THEN NULL ELSE ${reviews.analysisStartedAt} END`,
      analysisFailureCode: sql`CASE WHEN ${reviews.version} IS NOT NULL THEN NULL ELSE ${reviews.analysisFailureCode} END`,
    })
    .where(scanScope(input, scan))
  await tx.update(storeConnections).set({ appleVersionLookup: null }).where(connectionScope(input))
}
