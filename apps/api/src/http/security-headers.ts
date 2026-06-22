import type { Context, Next } from 'hono'

const securityHeaders = {
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), geolocation=(), microphone=()',
} as const

export async function applySecurityHeaders(context: Context, next: Next): Promise<void> {
  for (const [name, value] of Object.entries(securityHeaders)) {
    context.header(name, value)
  }

  await next()
}

export function expectedSecurityHeaders(): Readonly<Record<string, string>> {
  return securityHeaders
}
