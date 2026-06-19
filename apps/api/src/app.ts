import { healthResponseSchema } from '@reviewinbox/contracts'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'

import { auth } from './auth'
import { requireInvitationForSelfHostedSignUp } from './auth/sign-up-policy'
import { appsRoutes } from './routes/apps'
import { clientConfigRoutes } from './routes/client-config'
import { invitationsRoutes } from './routes/invitations'
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

  app.route('/', clientConfigRoutes)
  app.route('/', invitationsRoutes)
  app.use('/api/auth/sign-up/email', requireInvitationForSelfHostedSignUp)
  app.on(['GET', 'POST'], '/api/auth/*', (context) => auth.handler(context.req.raw))
  app.route('/', appsRoutes)
  app.route('/', storeConnectionsRoutes)

  return app
}

export type ApiApp = ReturnType<typeof createApp>
