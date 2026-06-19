import { clientConfigResponseSchema, healthResponseSchema } from '@reviewinbox/contracts'
import { user } from '@reviewinbox/db'
import { count } from 'drizzle-orm'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'

import { auth } from './auth'
import { database, serverConfig } from './db'
import { appsRoutes } from './routes/apps'
import { storeConnectionsRoutes } from './routes/store-connections'

export function createApp() {
  const app = new Hono()

  app.use(
    '/api/*',
    bodyLimit({
      maxSize: 128 * 1024,
      onError: (context) => context.json({ error: 'Request body too large.' }, 413),
    }),
  )

  app.get('/api/health', (context) => {
    const health = healthResponseSchema.parse({
      ok: true,
      service: 'api',
      checkedAt: new Date().toISOString(),
    })

    return context.json(health)
  })

  app.get('/api/client-config', async (context) => {
    const [result] = await database.select({ count: count() }).from(user)
    const signUpAvailable = serverConfig.deploymentMode === 'cloud' || (result?.count ?? 0) === 0

    const config = clientConfigResponseSchema.parse({
      deploymentMode: serverConfig.deploymentMode,
      auth: {
        emailPassword: true,
        google: false,
        enterpriseSso: false,
        signUpAvailable,
      },
    })

    return context.json(config)
  })

  app.on(['GET', 'POST'], '/api/auth/*', (context) => auth.handler(context.req.raw))
  app.route('/', appsRoutes)
  app.route('/', storeConnectionsRoutes)

  return app
}

export type ApiApp = ReturnType<typeof createApp>
