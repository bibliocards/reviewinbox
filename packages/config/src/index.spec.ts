import { describe, expect, it } from 'vitest'

import {
  getNextAutoSyncWindowStartsAt,
  loadAiConfig,
  loadEncryptionConfig,
  loadServerConfig,
  loadWorkerConfig,
} from './index'

describe('loadServerConfig', () => {
  it('uses safe local defaults', () => {
    expect(loadServerConfig({})).toMatchObject({
      deploymentMode: 'self-hosted',
      runDatabaseMigrationsOnStartup: false,
      replyDraftWorkerEnabled: false,
      apiHost: '127.0.0.1',
      apiPort: 3000,
    })
  })

  it('enables Reply Draft worker enqueueing explicitly', () => {
    expect(loadServerConfig({ REPLY_DRAFT_WORKER_ENABLED: 'true' })).toMatchObject({
      replyDraftWorkerEnabled: true,
    })
  })

  it('enables startup migrations explicitly', () => {
    expect(loadServerConfig({ RUN_DB_MIGRATIONS_ON_STARTUP: 'true' })).toMatchObject({
      runDatabaseMigrationsOnStartup: true,
    })
  })

  it('allows local HTTP origins when simulating cloud locally', () => {
    expect(
      loadServerConfig({
        DEPLOYMENT_MODE: 'cloud',
        APP_PUBLIC_URL: 'http://localhost:4200',
        BETTER_AUTH_URL: 'http://127.0.0.1:3000',
        BETTER_AUTH_TRUSTED_ORIGINS: 'http://localhost:4200,http://127.0.0.1:4200',
        STRIPE_SECRET_KEY: 'sk_test_example',
        STRIPE_WEBHOOK_SECRET: 'whsec_example',
        STRIPE_STARTER_PRICE_ID: 'price_starter',
        STRIPE_STARTER_ANNUAL_PRICE_ID: 'price_starter_annual',
      }),
    ).toMatchObject({ deploymentMode: 'cloud' })
  })

  it('requires Stripe billing configuration in cloud mode', () => {
    expect(() =>
      loadServerConfig({
        DEPLOYMENT_MODE: 'cloud',
        APP_PUBLIC_URL: 'http://localhost:4200',
        BETTER_AUTH_URL: 'http://127.0.0.1:3000',
        BETTER_AUTH_TRUSTED_ORIGINS: 'http://localhost:4200,http://127.0.0.1:4200',
      }),
    ).toThrow(/Stripe billing/u)
  })
})

describe('partial server configuration', () => {
  it.each([
    [
      'MAIL_FROM without SMTP_HOST',
      { MAIL_FROM: 'no-reply@example.com' },
      /MAIL_FROM and SMTP_HOST/u,
    ],
    ['SMTP_HOST without MAIL_FROM', { SMTP_HOST: 'smtp.example.com' }, /MAIL_FROM and SMTP_HOST/u],
    ['S3_REGION without other S3 values', { S3_REGION: 'eu-west-1' }, /S3_REGION, S3_BUCKET/u],
    ['S3_BUCKET without other S3 values', { S3_BUCKET: 'reviewinbox' }, /S3_REGION, S3_BUCKET/u],
    [
      'S3_ACCESS_KEY_ID without other S3 values',
      { S3_ACCESS_KEY_ID: 'access-key' },
      /S3_REGION, S3_BUCKET/u,
    ],
    [
      'S3_SECRET_ACCESS_KEY without other S3 values',
      { S3_SECRET_ACCESS_KEY: 'secret-key' },
      /S3_REGION, S3_BUCKET/u,
    ],
    [
      'Stripe secret without webhook secret',
      { STRIPE_SECRET_KEY: 'sk_test_example' },
      /STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET/u,
    ],
    [
      'Stripe webhook secret without Stripe secret',
      { STRIPE_WEBHOOK_SECRET: 'whsec_example' },
      /STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET/u,
    ],
    [
      'Stripe monthly price without annual price',
      { STRIPE_STARTER_PRICE_ID: 'price_starter' },
      /monthly and annual/u,
    ],
    [
      'Stripe annual price without monthly price',
      { STRIPE_STARTER_ANNUAL_PRICE_ID: 'price_starter_annual' },
      /monthly and annual/u,
    ],
    [
      'Stripe prices without Stripe secrets',
      {
        STRIPE_STARTER_PRICE_ID: 'price_starter',
        STRIPE_STARTER_ANNUAL_PRICE_ID: 'price_starter_annual',
      },
      /Stripe plan prices require/u,
    ],
    [
      'Stripe secrets without plan prices',
      { STRIPE_SECRET_KEY: 'sk_test_example', STRIPE_WEBHOOK_SECRET: 'whsec_example' },
      /Stripe billing requires/u,
    ],
  ])('%s rejects incomplete configuration', (_name, environment, message) => {
    expect(() => loadServerConfig(environment)).toThrow(message)
  })
})

describe('loadWorkerConfig', () => {
  it('allows cloud worker startup without API billing configuration', () => {
    expect(
      loadWorkerConfig({
        DEPLOYMENT_MODE: 'cloud',
        DATABASE_URL: 'postgres://reviewinbox:reviewinbox@localhost:5432/reviewinbox',
      }),
    ).toMatchObject({
      deploymentMode: 'cloud',
      databaseUrl: 'postgres://reviewinbox:reviewinbox@localhost:5432/reviewinbox',
    })
  })
})

describe('getNextAutoSyncWindowStartsAt', () => {
  it('returns the next six-hour UTC window', () => {
    expect(getNextAutoSyncWindowStartsAt(new Date('2026-06-20T05:59:00.000Z')).toISOString()).toBe(
      '2026-06-20T06:00:00.000Z',
    )
    expect(getNextAutoSyncWindowStartsAt(new Date('2026-06-20T06:00:00.000Z')).toISOString()).toBe(
      '2026-06-20T06:00:00.000Z',
    )
    expect(getNextAutoSyncWindowStartsAt(new Date('2026-06-20T23:59:00.000Z')).toISOString()).toBe(
      '2026-06-21T00:00:00.000Z',
    )
  })
})

describe('loadAiConfig', () => {
  it('defaults to disabled AI', () => {
    expect(loadAiConfig({})).toMatchObject({ deploymentMode: 'self-hosted', provider: 'disabled' })
  })

  it('accepts OpenAI-compatible provider configuration', () => {
    expect(
      loadAiConfig({
        AI_PROVIDER: 'openai-compatible',
        AI_MODEL: 'gpt-4.1-mini',
        AI_API_KEY: 'test-key',
        AI_BASE_URL: 'http://localhost:11434/v1',
      }),
    ).toEqual({
      deploymentMode: 'self-hosted',
      provider: 'openai-compatible',
      model: 'gpt-4.1-mini',
      apiKey: 'test-key',
      baseUrl: 'http://localhost:11434/v1',
    })
  })

  it('requires an API key for OpenAI-compatible provider configuration', () => {
    expect(() =>
      loadAiConfig({ AI_PROVIDER: 'openai-compatible', AI_MODEL: 'gpt-4.1-mini' }),
    ).toThrow(/AI_API_KEY/u)
  })

  it('accepts managed AI in cloud when the operator provider is configured', () => {
    expect(
      loadAiConfig({
        DEPLOYMENT_MODE: 'cloud',
        AI_PROVIDER: 'managed',
        AI_MODEL: 'gpt-4.1-mini',
        AI_API_KEY: 'operator-key',
      }),
    ).toEqual({
      deploymentMode: 'cloud',
      provider: 'managed',
      model: 'gpt-4.1-mini',
      apiKey: 'operator-key',
    })
  })

  it('rejects managed AI for self-hosted deployments', () => {
    expect(() =>
      loadAiConfig({
        AI_PROVIDER: 'managed',
        AI_MODEL: 'gpt-4.1-mini',
        AI_API_KEY: 'operator-key',
      }),
    ).toThrow(/only available in cloud/u)
  })

  it('requires an API key for managed AI', () => {
    expect(() =>
      loadAiConfig({ DEPLOYMENT_MODE: 'cloud', AI_PROVIDER: 'managed', AI_MODEL: 'gpt-4.1-mini' }),
    ).toThrow(/AI_API_KEY/u)
  })

  it('rejects non-local HTTP AI base URLs', () => {
    expect(() =>
      loadAiConfig({
        AI_PROVIDER: 'openai-compatible',
        AI_MODEL: 'gpt-4.1-mini',
        AI_API_KEY: 'test-key',
        AI_BASE_URL: 'http://example.com/v1',
      }),
    ).toThrow(/HTTPS/u)
  })

  it('rejects AI base URLs with credentials', () => {
    expect(() =>
      loadAiConfig({
        AI_PROVIDER: 'openai-compatible',
        AI_MODEL: 'gpt-4.1-mini',
        AI_API_KEY: 'test-key',
        AI_BASE_URL: 'https://user:pass@example.com/v1',
      }),
    ).toThrow(/credentials/u)
  })
})

describe('invalid AI base URL', () => {
  it('rejects values that are not URLs', () => {
    expect(() =>
      loadAiConfig({
        AI_PROVIDER: 'openai-compatible',
        AI_MODEL: 'gpt-4.1-mini',
        AI_API_KEY: 'test-key',
        AI_BASE_URL: 'not-a-url',
      }),
    ).toThrow(/valid URL/u)
  })
})

describe('loadEncryptionConfig', () => {
  it('accepts a base64-encoded 32-byte encryption key', () => {
    const appEncryptionKey = Buffer.alloc(32, 1).toString('base64')

    expect(loadEncryptionConfig({ APP_ENCRYPTION_KEY: appEncryptionKey })).toEqual({
      appEncryptionKey,
    })
  })

  it('rejects keys that are not 32 bytes', () => {
    expect(() =>
      loadEncryptionConfig({ APP_ENCRYPTION_KEY: Buffer.alloc(16, 1).toString('base64') }),
    ).toThrow(/32 bytes/u)
  })
})
