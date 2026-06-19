import { serve } from '@hono/node-server'
import { loadServerConfig } from '@reviewinbox/config'
import { runDatabaseMigrations } from '@reviewinbox/db'

import { createApp } from './app'

const config = loadServerConfig()

if (config.runDatabaseMigrationsOnStartup) {
  console.info('Applying database migrations before starting ReviewInbox API')
  await runDatabaseMigrations(config.databaseUrl)
}

serve(
  {
    fetch: createApp().fetch,
    hostname: config.apiHost,
    port: config.apiPort,
  },
  (info) => {
    console.info(`ReviewInbox API listening on http://${info.address}:${info.port}`)
  },
)
