import { generateReplyDraft } from '@reviewinbox/ai'
import { getPlanDefinition } from '@reviewinbox/billing'
import { getNextAutoSyncWindowStartsAt, loadAiConfig, loadWorkerConfig } from '@reviewinbox/config'
import {
  closeDatabase,
  createDatabase,
  organization,
  runDatabaseMigrations,
  storeConnections,
  storeCredentials,
  syncRuns,
} from '@reviewinbox/db'
import { createQueueClient } from '@reviewinbox/queue'
import { generateReplyDraftForReview } from '@reviewinbox/reply-drafts'
import { syncReviewsForStoreConnection } from '@reviewinbox/sync'
import { and, asc, desc, eq } from 'drizzle-orm'

import { createWorkerReplyDraftProvider } from './ai-provider'

const shutdownSignals = ['SIGINT', 'SIGTERM'] as const

async function main() {
  const config = loadWorkerConfig()
  const aiConfig = loadAiConfig()

  if (config.runDatabaseMigrationsOnStartup) {
    console.info('Applying database migrations before starting ReviewInbox worker')
    await runDatabaseMigrations(config.databaseUrl)
  }

  const database = createDatabase(config.databaseUrl)
  const queue = createQueueClient({
    databaseUrl: config.databaseUrl,
    onError: (error) => {
      console.error('ReviewInbox worker queue error', serializeErrorForLog(error))
    },
  })

  await queue.start()
  let autoSyncTimer: ReturnType<typeof setTimeout> | null = null
  const replyDraftProvider = createWorkerReplyDraftProvider(aiConfig)
  const replyDraftProviderKind = aiConfig.provider === 'managed' || aiConfig.provider === 'openai-compatible' ? aiConfig.provider : null

  await queue.workSyncStoreConnection(async (job) => {
    console.info('ReviewInbox worker processing Store Connection sync job', {
      jobId: job.id,
      storeConnectionId: job.payload.storeConnectionId,
      windowStartsAt: job.payload.windowStartsAt,
    })

    const syncRun = await syncReviewsForStoreConnection({
      database,
      organizationId: job.payload.organizationId,
      storeConnectionId: job.payload.storeConnectionId,
      deploymentMode: config.deploymentMode,
    })

    if ((syncRun.status === 'succeeded' || syncRun.status === 'partial') && replyDraftProvider) {
      await enqueueGenerateReplyDraftJobs({
        organizationId: syncRun.organizationId,
        reviewIds: syncRun.newReviewIds,
      })
    }

    console.info('ReviewInbox worker finished Store Connection sync job', {
      jobId: job.id,
      storeConnectionId: job.payload.storeConnectionId,
      status: syncRun.status,
      fetchedCount: syncRun.fetchedCount,
      storedCount: syncRun.storedCount,
    })
  })

  if (replyDraftProvider) {
    await queue.workGenerateReplyDraft(async (job) => {
      console.info('ReviewInbox worker processing Reply Draft job', {
        jobId: job.id,
        reviewId: job.payload.reviewId,
      })

      const result = await generateReplyDraftForReview({
        database,
        organizationId: job.payload.organizationId,
        reviewId: job.payload.reviewId,
        deploymentMode: config.deploymentMode,
        aiProvider: replyDraftProviderKind ?? 'openai-compatible',
        generateDraft: (draftInput) => generateReplyDraft(draftInput, { provider: replyDraftProvider }),
      })

      if (result.status === 'failed' && isRetryableDraftFailure(result.errorCode)) {
        console.warn('ReviewInbox worker will retry Reply Draft job', {
          jobId: job.id,
          reviewId: job.payload.reviewId,
          errorCode: result.errorCode,
        })
        throw new Error(`Reply Draft generation failed with ${result.errorCode}.`)
      }

      console.info('ReviewInbox worker finished Reply Draft job', {
        jobId: job.id,
        reviewId: job.payload.reviewId,
        status: result.status,
      })
    })
  }

  if (config.autoSyncReviewsEnabled) {
    autoSyncTimer = scheduleNextAutoSyncRun()
  }

  console.info(
    replyDraftProvider
      ? 'ReviewInbox worker started with Store Connection sync and AI drafting handlers registered'
      : 'ReviewInbox worker started with Store Connection sync handler registered; AI drafting disabled',
  )

  const signal = await waitForShutdownSignal()
  console.info(`ReviewInbox worker received ${signal}, shutting down`)

  if (autoSyncTimer) {
    clearTimeout(autoSyncTimer)
  }
  try {
    await queue.stop()
  } finally {
    await closeDatabase(database)
  }

  async function enqueueGenerateReplyDraftJobs(input: { organizationId: string; reviewIds: string[] }): Promise<void> {
    for (const reviewId of input.reviewIds) {
      try {
        await queue.enqueueGenerateReplyDraft({ organizationId: input.organizationId, reviewId })
      } catch (error) {
        console.error('ReviewInbox worker draft job enqueue failed after Store Connection sync', {
          reviewId,
          error: serializeErrorForLog(error),
        })
      }
    }
  }

  function scheduleNextAutoSyncRun(): ReturnType<typeof setTimeout> {
    const windowStartsAt = getNextAutoSyncWindowStartsAt()
    const delayMs = Math.max(0, windowStartsAt.getTime() - Date.now())
    console.info('ReviewInbox worker scheduled next automatic Store Connection sync window', {
      windowStartsAt: windowStartsAt.toISOString(),
      spreadWindowMinutes: config.autoSyncReviewsSpreadWindowMinutes,
    })

    return setTimeout(() => {
      void enqueueAutoSyncWindow(windowStartsAt)
        .catch((error: unknown) => {
          console.error('ReviewInbox worker failed to enqueue automatic Store Connection sync window', serializeErrorForLog(error))
        })
        .finally(() => {
          autoSyncTimer = scheduleNextAutoSyncRun()
        })
    }, delayMs)
  }

  async function enqueueAutoSyncWindow(windowStartsAt: Date): Promise<void> {
    const connections = await database
      .select({ organizationId: storeConnections.organizationId, storeConnectionId: storeConnections.id })
      .from(storeConnections)
      .innerJoin(storeCredentials, eq(storeCredentials.storeConnectionId, storeConnections.id))
      .where(eq(storeConnections.status, 'active'))
      .orderBy(asc(storeConnections.id))

    const spreadMs = config.autoSyncReviewsSpreadWindowMinutes * 60 * 1000
    for (const [index, connection] of connections.entries()) {
      const shouldSync = await shouldAutoSyncStoreConnection(connection.organizationId, connection.storeConnectionId, windowStartsAt)
      if (!shouldSync) {
        continue
      }

      const delayMs = connections.length <= 1 ? 0 : Math.floor((spreadMs * index) / connections.length)
      await queue.enqueueSyncStoreConnection(
        {
          organizationId: connection.organizationId,
          storeConnectionId: connection.storeConnectionId,
          windowStartsAt: windowStartsAt.toISOString(),
        },
        { startAfter: new Date(windowStartsAt.getTime() + delayMs) },
      )
    }

    console.info('ReviewInbox worker enqueued automatic Store Connection sync window', {
      windowStartsAt: windowStartsAt.toISOString(),
      storeConnectionCount: connections.length,
      spreadWindowMinutes: config.autoSyncReviewsSpreadWindowMinutes,
    })
  }

  async function shouldAutoSyncStoreConnection(organizationId: string, storeConnectionId: string, windowStartsAt: Date): Promise<boolean> {
    if (config.deploymentMode !== 'cloud') {
      return true
    }

    const billingOrganization = await database.query.organization.findFirst({
      columns: { planName: true },
      where: eq(organization.id, organizationId),
    })
    if (!billingOrganization) {
      return false
    }

    const intervalMs = getPlanDefinition(billingOrganization.planName).autoSyncIntervalHours * 60 * 60 * 1000
    const lastRun = await database.query.syncRuns.findFirst({
      columns: { startedAt: true, createdAt: true },
      where: and(eq(syncRuns.storeConnectionId, storeConnectionId), eq(syncRuns.organizationId, organizationId)),
      orderBy: [desc(syncRuns.startedAt), desc(syncRuns.createdAt)],
    })
    const lastRunAt = lastRun?.startedAt ?? lastRun?.createdAt

    return !lastRunAt || windowStartsAt.getTime() - lastRunAt.getTime() >= intervalMs
  }
}

function waitForShutdownSignal(): Promise<(typeof shutdownSignals)[number]> {
  return new Promise((resolve) => {
    for (const signal of shutdownSignals) {
      process.once(signal, () => resolve(signal))
    }
  })
}

main().catch((error: unknown) => {
  console.error('ReviewInbox worker failed', serializeErrorForLog(error))
  process.exitCode = 1
})

function serializeErrorForLog(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return { name: error.name, message: error.message }
  }

  return { name: 'UnknownError', message: 'Unknown worker error' }
}

function isRetryableDraftFailure(errorCode: string): boolean {
  return errorCode === 'provider_unavailable' || errorCode === 'provider_rate_limited'
}
