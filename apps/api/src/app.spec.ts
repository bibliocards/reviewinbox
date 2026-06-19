import { clientConfigResponseSchema, healthResponseSchema } from '@reviewinbox/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

let userCount = 0

vi.mock('./db', () => ({
  database: {
    select: vi.fn(() => ({
      from: vi.fn(async () => [{ count: userCount }]),
    })),
  },
  serverConfig: {
    betterAuthSecret: 'test-secret-at-least-32-characters',
    betterAuthTrustedOrigins: ['http://localhost:4200'],
    betterAuthUrl: 'http://127.0.0.1:3000',
    deploymentMode: 'self-hosted',
    appPublicUrl: 'http://localhost:4200',
    uploadLocalDir: 'volumes/uploads-test',
    mailFrom: undefined,
    smtpHost: undefined,
  },
}))

import { createApp } from './app'

beforeEach(() => {
  userCount = 0
})

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

describe('GET /api/client-config', () => {
  it('allows sign-up before the first self-hosted account exists', async () => {
    const response = await createApp().request('/api/client-config')

    expect(response.status).toBe(200)
    const body: unknown = await response.json()

    expect(clientConfigResponseSchema.parse(body)).toMatchObject({
      deploymentMode: 'self-hosted',
      auth: {
        signUpAvailable: true,
      },
    })
  })

  it('disables sign-up once a self-hosted account exists', async () => {
    userCount = 1

    const response = await createApp().request('/api/client-config')

    expect(response.status).toBe(200)
    const body: unknown = await response.json()

    expect(clientConfigResponseSchema.parse(body)).toMatchObject({
      deploymentMode: 'self-hosted',
      auth: {
        signUpAvailable: false,
      },
    })
  })
})
