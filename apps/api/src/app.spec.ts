import { healthResponseSchema } from '@reviewinbox/contracts'
import { describe, expect, it } from 'vitest'

import { createApp } from './app'

describe('GET /api/health', () => {
  it('returns the typed health payload', async () => {
    const response = await createApp().request('/api/health')

    expect(response.status).toBe(200)
    const body: unknown = await response.json()

    expect(healthResponseSchema.parse(body)).toMatchObject({
      ok: true,
      service: 'api',
    })
  })
})
