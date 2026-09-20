import { generateReplyDraft, type ReplyDraftProvider } from '@reviewinbox/ai'
import { getPlanDefinition } from '@reviewinbox/billing'
import {
  getNextAutoSyncWindowStartsAt,
  loadAiConfig,
  loadWorkerConfig,
  type AiConfig,
  type WorkerConfig,
} from '@reviewinbox/config'
import {
  closeDatabase,
  createDatabase,
  organization,
  runDatabaseMigrations,
  storeConnections,
  storeCredentials,
  syncRuns,
  type Database,
} from '@reviewinbox/db'
import { createQueueClient, type QueueClient } from '@reviewinbox/queue'
import { generateReplyDraftForReview } from '@reviewinbox/reply-drafts'
import {
  syncReviewsForStoreConnection,
  type SyncReviewsForStoreConnectionInput,
} from '@reviewinbox/sync'
import { and, asc, desc, eq, isNull, isNotNull } from 'drizzle-orm'

import { createWorkerReplyDraftProvider } from './ai-provider'
import { getAutoSyncJobStartsAt, isAutoSyncDueAt } from './auto-sync-scheduler'

const shutdownSignals = ['SIGINT', 'SIGTERM'] as const

type ReplyDraftProviderKind = Extract<AiConfig['provider'], 'managed' | 'openai-compatible'>

type WorkerRuntime = {
  config: WorkerConfig
  database: Database
  queue: QueueClient
  replyDraftProvider: ReplyDraftProvider | null
  replyDraftProviderKind: ReplyDraftProviderKind | null
  autoSyncTimer: ReturnType<typeof setTimeout> | null
}

type LogDetails = Readonly<Record<string, boolean | number | string | null>>

async function main(): Promise<void> {
  const runtime = await createWorkerRuntime()
  await registerStoreSyncHandler(runtime)
  await registerDraftHandler(runtime)
  runtime.autoSyncTimer = startAutoSyncScheduler(runtime)
  logWorkerStarted(runtime)
  await waitForShutdown(runtime)
}

async function createWorkerRuntime(): Promise<WorkerRuntime> {
  const config = loadWorkerConfig()
  const aiConfig = loadAiConfig()
  await runStartupMigrations(config)
  const database = createDatabase(config.databaseUrl)
  const queue = createWorkerQueue(config)
  await queue.start()

  return {
    config,
    database,
    queue,
    replyDraftProvider: createWorkerReplyDraftProvider(aiConfig),
    replyDraftProviderKind: getReplyDraftProviderKind(aiConfig),
    autoSyncTimer: null,
  }
}

async function runStartupMigrations(config: WorkerConfig): Promise<void> {
  if (!config.runDatabaseMigrationsOnStartup) {
    return
  }

  logInfo('Applying database migrations before starting ReviewInbox worker')
  await runDatabaseMigrations(config.databaseUrl)
}

function createWorkerQueue(config: WorkerConfig): QueueClient {
  return createQueueClient({
    databaseUrl: config.databaseUrl,
    onError: (error) => {
      logError('ReviewInbox worker queue error', serializeErrorForLog(error))
    },
  })
}

function getReplyDraftProviderKind(aiConfig: AiConfig): ReplyDraftProviderKind | null {
  return aiConfig.provider === 'managed' || aiConfig.provider === 'openai-compatible'
    ? aiConfig.provider
    : null
}

async function registerStoreSyncHandler(runtime: WorkerRuntime): Promise<void> {
  await runtime.queue.workSyncStoreConnection(async (job) => {
    logInfo('ReviewInbox worker processing Store Connection sync job', {
      jobId: job.id,
      storeConnectionId: job.payload.storeConnectionId,
      windowStartsAt: job.payload.windowStartsAt,
    })

    const syncRun = await runStoreConnectionSync(runtime, job.payload)
    if (isSuccessfulSyncWithDraftProvider(runtime, syncRun.status)) {
      await enqueueGenerateReplyDraftJobs(runtime, syncRun.organizationId, syncRun.newReviewIds)
    }

    logInfo('ReviewInbox worker finished Store Connection sync job', {
      jobId: job.id,
      storeConnectionId: job.payload.storeConnectionId,
      status: syncRun.status,
      fetchedCount: syncRun.fetchedCount,
      storedCount: syncRun.storedCount,
    })
  })
}

function runStoreConnectionSync(
  runtime: WorkerRuntime,
  payload: Parameters<Parameters<QueueClient['workSyncStoreConnection']>[0]>[0]['payload'],
) {
  const syncInput: SyncReviewsForStoreConnectionInput = {
    database: runtime.database,
    organizationId: payload.organizationId,
    storeConnectionId: payload.storeConnectionId,
    deploymentMode: runtime.config.deploymentMode,
  }
  if (payload.trigger === 'automatic') {
    syncInput.windowStartsAt = new Date(payload.windowStartsAt)
  }
  return syncReviewsForStoreConnection(syncInput)
}

function isSuccessfulSyncWithDraftProvider(runtime: WorkerRuntime, status: string): boolean {
  return (status === 'succeeded' || status === 'partial') && runtime.replyDraftProvider !== null
}

async function enqueueGenerateReplyDraftJobs(
  runtime: WorkerRuntime,
  organizationId: string,
  reviewIds: readonly string[],
): Promise<void> {
  await reviewIds.reduce(
    (previous, reviewId) =>
      previous.then(() => enqueueGenerateReplyDraftJob(runtime, organizationId, reviewId)),
    Promise.resolve(),
  )
}

async function enqueueGenerateReplyDraftJob(
  runtime: WorkerRuntime,
  organizationId: string,
  reviewId: string,
): Promise<void> {
  try {
    await runtime.queue.enqueueGenerateReplyDraft({ organizationId, reviewId })
  } catch (error) {
    logError('ReviewInbox worker draft job enqueue failed after Store Connection sync', {
      reviewId,
      error: error instanceof Error ? error.message : 'Unknown worker error',
    })
  }
}

async function registerDraftHandler(runtime: WorkerRuntime): Promise<void> {
  const provider = runtime.replyDraftProvider
  if (provider === null) {
    return
  }

  await runtime.queue.workGenerateReplyDraft(async (job) => {
    logInfo('ReviewInbox worker processing Reply Draft job', {
      jobId: job.id,
      reviewId: job.payload.reviewId,
    })

    const result = await generateReplyDraftForReview({
      database: runtime.database,
      organizationId: job.payload.organizationId,
      reviewId: job.payload.reviewId,
      deploymentMode: runtime.config.deploymentMode,
      aiProvider: runtime.replyDraftProviderKind ?? 'openai-compatible',
      generateDraft: (draftInput) => generateReplyDraft(draftInput, { provider }),
    })

    if (result.status === 'failed' && isRetryableDraftFailure(result.errorCode)) {
      logWarn('ReviewInbox worker will retry Reply Draft job', {
        jobId: job.id,
        reviewId: job.payload.reviewId,
        errorCode: result.errorCode,
      })
      throw new Error(`Reply Draft generation failed with ${result.errorCode}.`)
    }

    logInfo('ReviewInbox worker finished Reply Draft job', {
      jobId: job.id,
      reviewId: job.payload.reviewId,
      status: result.status,
    })
  })
}

function startAutoSyncScheduler(runtime: WorkerRuntime): ReturnType<typeof setTimeout> | null {
  return runtime.config.autoSyncReviewsEnabled ? scheduleNextAutoSyncRun(runtime) : null
}

function scheduleNextAutoSyncRun(runtime: WorkerRuntime): ReturnType<typeof setTimeout> {
  const windowStartsAt = getNextAutoSyncWindowStartsAt()
  const delayMs = Math.max(0, windowStartsAt.getTime() - Date.now())
  logInfo('ReviewInbox worker scheduled next automatic Store Connection sync window', {
    windowStartsAt: windowStartsAt.toISOString(),
    spreadWindowMinutes: runtime.config.autoSyncReviewsSpreadWindowMinutes,
  })

  return setTimeout(() => {
    void enqueueAutoSyncWindow(runtime, windowStartsAt)
      .catch((error) => {
        logError(
          'ReviewInbox worker failed to enqueue automatic Store Connection sync window',
          error instanceof Error ? serializeErrorForLog(error) : { name: 'UnknownError' },
        )
      })
      .finally(() => {
        runtime.autoSyncTimer = scheduleNextAutoSyncRun(runtime)
      })
  }, delayMs)
}

async function enqueueAutoSyncWindow(runtime: WorkerRuntime, windowStartsAt: Date): Promise<void> {
  const connections = await loadAutoSyncConnections(runtime.database)
  await connections.reduce(
    (previous, connection, index) =>
      previous.then(() =>
        enqueueAutoSyncConnection({
          runtime,
          connection,
          connectionIndex: index,
          connectionCount: connections.length,
          windowStartsAt,
        }),
      ),
    Promise.resolve(),
  )

  logInfo('ReviewInbox worker enqueued automatic Store Connection sync window', {
    windowStartsAt: windowStartsAt.toISOString(),
    storeConnectionCount: connections.length,
    spreadWindowMinutes: runtime.config.autoSyncReviewsSpreadWindowMinutes,
  })
}

function loadAutoSyncConnections(database: Database) {
  return database
    .select({
      organizationId: storeConnections.organizationId,
      storeConnectionId: storeConnections.id,
    })
    .from(storeConnections)
    .innerJoin(storeCredentials, eq(storeCredentials.storeConnectionId, storeConnections.id))
    .where(eq(storeConnections.status, 'active'))
    .orderBy(asc(storeConnections.id))
}

type AutoSyncConnectionInput = {
  runtime: WorkerRuntime
  connection: Awaited<ReturnType<typeof loadAutoSyncConnections>>[number]
  connectionIndex: number
  connectionCount: number
  windowStartsAt: Date
}

async function enqueueAutoSyncConnection(input: AutoSyncConnectionInput): Promise<void> {
  const { runtime, connection, connectionIndex, connectionCount, windowStartsAt } = input
  const scheduledStartsAt = getAutoSyncJobStartsAt({
    windowStartsAt,
    connectionIndex,
    connectionCount,
    spreadWindowMinutes: runtime.config.autoSyncReviewsSpreadWindowMinutes,
  })
  const shouldSync = await shouldAutoSyncStoreConnection({
    runtime,
    organizationId: connection.organizationId,
    storeConnectionId: connection.storeConnectionId,
    windowStartsAt,
    scheduledStartsAt,
  })
  if (!shouldSync) {
    return
  }

  await runtime.queue.enqueueSyncStoreConnection(
    {
      organizationId: connection.organizationId,
      storeConnectionId: connection.storeConnectionId,
      windowStartsAt: windowStartsAt.toISOString(),
      trigger: 'automatic',
    },
    { startAfter: scheduledStartsAt },
  )
}

type AutoSyncCheckInput = {
  runtime: WorkerRuntime
  organizationId: string
  storeConnectionId: string
  windowStartsAt: Date
  scheduledStartsAt: Date
}

async function shouldAutoSyncStoreConnection(input: AutoSyncCheckInput): Promise<boolean> {
  const { runtime, organizationId, storeConnectionId, windowStartsAt, scheduledStartsAt } = input
  if (runtime.config.deploymentMode !== 'cloud') {
    return true
  }

  const billingOrganization = await runtime.database.query.organization.findFirst({
    columns: { planName: true },
    where: eq(organization.id, organizationId),
  })
  if (!billingOrganization) {
    return false
  }

  const intervalMs =
    getPlanDefinition(billingOrganization.planName).autoSyncIntervalHours * 60 * 60 * 1000
  const [lastAutomaticRun, lastNonAutomaticRun] = await loadLatestSyncRuns(
    runtime.database,
    organizationId,
    storeConnectionId,
  )
  return isAutoSyncDueAt({
    windowStartsAt,
    scheduledStartsAt,
    intervalMs,
    lastAutomaticWindowStartsAt: lastAutomaticRun?.windowStartsAt ?? null,
    lastNonAutomaticRunAt: lastNonAutomaticRun?.startedAt ?? lastNonAutomaticRun?.createdAt ?? null,
  })
}

function loadLatestSyncRuns(database: Database, organizationId: string, storeConnectionId: string) {
  return Promise.all([
    database.query.syncRuns.findFirst({
      columns: { windowStartsAt: true },
      where: and(
        eq(syncRuns.storeConnectionId, storeConnectionId),
        eq(syncRuns.organizationId, organizationId),
        isNotNull(syncRuns.windowStartsAt),
      ),
      orderBy: [desc(syncRuns.windowStartsAt), desc(syncRuns.createdAt)],
    }),
    database.query.syncRuns.findFirst({
      columns: { startedAt: true, createdAt: true },
      where: and(
        eq(syncRuns.storeConnectionId, storeConnectionId),
        eq(syncRuns.organizationId, organizationId),
        isNull(syncRuns.windowStartsAt),
      ),
      orderBy: [desc(syncRuns.startedAt), desc(syncRuns.createdAt)],
    }),
  ])
}

function logWorkerStarted(runtime: WorkerRuntime): void {
  logInfo(
    runtime.replyDraftProvider
      ? 'ReviewInbox worker started with Store Connection sync and AI drafting handlers registered'
      : 'ReviewInbox worker started with Store Connection sync handler registered; AI drafting disabled',
  )
}

async function waitForShutdown(runtime: WorkerRuntime): Promise<void> {
  const signal = await waitForShutdownSignal()
  logInfo(`ReviewInbox worker received ${signal}, shutting down`)
  if (runtime.autoSyncTimer) {
    clearTimeout(runtime.autoSyncTimer)
  }
  try {
    await runtime.queue.stop()
  } finally {
    await closeDatabase(runtime.database)
  }
}

function waitForShutdownSignal(): Promise<(typeof shutdownSignals)[number]> {
  return new Promise((resolve) => {
    for (const signal of shutdownSignals) {
      process.once(signal, () => {
        resolve(signal)
      })
    }
  })
}

function logInfo(message: string, details?: LogDetails): void {
  writeLog(process.stdout, message, details)
}

function logWarn(message: string, details?: LogDetails): void {
  writeLog(process.stderr, message, details)
}

function logError(message: string, details?: LogDetails): void {
  writeLog(process.stderr, message, details)
}

function writeLog(stream: NodeJS.WritableStream, message: string, details?: LogDetails): void {
  const suffix = details ? ` ${JSON.stringify(details)}` : ''
  stream.write(`${message}${suffix}\n`)
}

function serializeErrorForLog(error: Error) {
  return { name: error.name, message: error.message }
}

function isRetryableDraftFailure(errorCode: string): boolean {
  return errorCode === 'provider_unavailable' || errorCode === 'provider_rate_limited'
}

await main().catch((error) => {
  const details = error instanceof Error ? serializeErrorForLog(error) : { name: 'UnknownError' }
  logError('ReviewInbox worker failed', details)
  process.exitCode = 1
})
