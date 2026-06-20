import { loadServerConfig } from '@reviewinbox/config'
import { runDatabaseMigrations } from '@reviewinbox/db'
import { createQueueClient } from '@reviewinbox/queue'

const shutdownSignals = ['SIGINT', 'SIGTERM'] as const

async function main() {
  const config = loadServerConfig()

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
  console.info('ReviewInbox worker started; no job handlers are registered yet')

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
