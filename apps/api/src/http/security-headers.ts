import { createMiddleware } from 'hono/factory'

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), geolocation=(), microphone=(), payment=()',
} as const

export function secureResponseHeaders() {
  return createMiddleware(async (context, next) => {
    for (const [name, value] of Object.entries(securityHeaders)) {
      context.header(name, value)
    }

    return next()
  })
}

export { securityHeaders }
