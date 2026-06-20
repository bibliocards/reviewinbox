import { loadAiConfig, loadServerConfig } from '@reviewinbox/config'
import { runDatabaseMigrations } from '@reviewinbox/db'
import { createQueueClient } from '@reviewinbox/queue'

import { createWorkerReplyDraftProvider } from './ai-provider'

const shutdownSignals = ['SIGINT', 'SIGTERM'] as const

async function main() {
  const config = loadServerConfig()
  const aiConfig = loadAiConfig()

  if (config.runDatabaseMigrationsOnStartup) {
    console.info('Applying database migrations before starting ReviewInbox worker')
    await runDatabaseMigrations(config.databaseUrl)
  }

  const queue = createQueueClient({
    databaseUrl: config.databaseUrl,
    onError: (error) => {
      console.error('ReviewInbox worker queue error', serializeErrorForLog(error))
    },
  })

  await queue.start()
  const replyDraftProvider = createWorkerReplyDraftProvider(aiConfig)
  console.info(
    replyDraftProvider
      ? 'ReviewInbox worker started with AI drafting provider configured; no job handlers are registered yet'
      : 'ReviewInbox worker started with AI drafting disabled; no job handlers are registered yet',
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
