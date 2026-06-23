import { serveStatic } from '@hono/node-server/serve-static'
import { healthResponseSchema } from '@reviewinbox/contracts'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { auth } from './auth'
import { requireInvitationForSelfHostedSignUp } from './auth/sign-up-policy'
import { serverConfig } from './db'
import { secureResponseHeaders } from './http/security-headers'
import { appsRoutes } from './routes/apps'
import { clientConfigRoutes } from './routes/client-config'
import { invitationsRoutes } from './routes/invitations'
import { organizationProfileRoutes } from './routes/organization-profile'
import { replyInboxRoutes } from './routes/reply-inbox'
import { storeConnectionsRoutes } from './routes/store-connections'

export function createApp() {
  const app = new Hono()
  const organizationLogosDir = join(serverConfig.uploadLocalDir, 'organization-logos')
  const jsonBodyLimit = bodyLimit({
    maxSize: 128 * 1024,
    onError: (context) => context.json({ error: 'Request body too large.' }, 413),
  })

  app.use('*', secureResponseHeaders())

  mkdirSync(organizationLogosDir, { recursive: true })
  app.use(
    '/api/uploads/organization-logos/*',
    serveStatic({
      root: organizationLogosDir,
      rewriteRequestPath: (path) => path.replace(/^\/api\/uploads\/organization-logos/, ''),
    }),
  )
  app.use('/api/*', async (context, next) => {
    if (!['DELETE', 'PATCH', 'POST', 'PUT'].includes(context.req.method) || context.req.path.startsWith('/api/auth/')) {
      return next()
    }

    const origin = parseOrigin(context.req.header('origin'))
    const allowedOrigins = new Set([...serverConfig.betterAuthTrustedOrigins, new URL(serverConfig.betterAuthUrl).origin])
    if (!origin || !allowedOrigins.has(origin)) {
      return context.json({ error: 'Request origin is not trusted.' }, 403)
    }

    return next()
  })
  app.use('/api/organization/profile/logo', bodyLimit({ maxSize: 6 * 1024 * 1024 }))
  app.use('/api/*', async (context, next) => {
    if (context.req.path === '/api/organization/profile/logo') {
      return next()
    }

    return jsonBodyLimit(context, next)
  })

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
  app.route('/', organizationProfileRoutes)
  app.route('/', appsRoutes)
  app.route('/', replyInboxRoutes)
  app.route('/', storeConnectionsRoutes)

  return app
}

export type ApiApp = ReturnType<typeof createApp>

function parseOrigin(origin: string | undefined): string | null {
  if (!origin) {
    return null
  }

  try {
    return new URL(origin).origin
  } catch {
    return null
  }
}
