import { generateReplyDraft } from '@reviewinbox/ai'
import { loadAiConfig, loadServerConfig } from '@reviewinbox/config'
import { createDatabase, runDatabaseMigrations } from '@reviewinbox/db'
import { createQueueClient } from '@reviewinbox/queue'
import { generateReplyDraftForReview } from '@reviewinbox/reply-drafts'

import { createWorkerReplyDraftProvider } from './ai-provider'

const shutdownSignals = ['SIGINT', 'SIGTERM'] as const

async function main() {
  const config = loadServerConfig()
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
  const replyDraftProvider = createWorkerReplyDraftProvider(aiConfig)
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

  console.info(
    replyDraftProvider
      ? 'ReviewInbox worker started with AI drafting handler registered'
      : 'ReviewInbox worker started with AI drafting disabled; no job handlers are registered',
  )

  const signal = await waitForShutdownSignal()
  console.info(`ReviewInbox worker received ${signal}, shutting down`)

  await queue.stop()
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
