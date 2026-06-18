import { serve } from "@hono/node-server"
import { loadServerConfig } from "@reviewinbox/config"

import { createApp } from "./app"

const config = loadServerConfig()

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
