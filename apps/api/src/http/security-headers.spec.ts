import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'

import { applySecurityHeaders, expectedSecurityHeaders } from './security-headers'

describe('applySecurityHeaders', () => {
  it('adds security hardening headers to responses', async () => {
    const app = new Hono()
    app.use('*', applySecurityHeaders)
    app.get('/health', (context) => context.json({ ok: true }))

    const response = await app.request('/health')

    for (const [name, value] of Object.entries(expectedSecurityHeaders())) {
      expect(response.headers.get(name)).toBe(value)
    }
  })
})
