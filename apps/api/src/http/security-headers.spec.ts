import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'

import { secureResponseHeaders, securityHeaders } from './security-headers'

describe('secureResponseHeaders', () => {
  it('applies default browser hardening headers', async () => {
    const app = new Hono()
    app.use('*', secureResponseHeaders())
    app.get('/health', (context) => context.json({ ok: true }))

    const response = await app.request('/health')

    for (const [name, value] of Object.entries(securityHeaders)) {
      expect(response.headers.get(name)).toBe(value)
    }
  })
})
