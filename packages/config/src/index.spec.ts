import { describe, expect, it } from 'vitest'

import { getNextAutoSyncWindowStartsAt, loadAiConfig, loadEncryptionConfig, loadServerConfig } from './index'

describe('loadServerConfig', () => {
  it('uses safe local defaults', () => {
    expect(loadServerConfig({})).toMatchObject({
      deploymentMode: 'self-hosted',
      runDatabaseMigrationsOnStartup: false,
      apiHost: '127.0.0.1',
      apiPort: 3000,
    })
  })

  it('enables startup migrations explicitly', () => {
    expect(loadServerConfig({ RUN_DB_MIGRATIONS_ON_STARTUP: 'true' })).toMatchObject({
      runDatabaseMigrationsOnStartup: true,
    })
  })
})

describe('getNextAutoSyncWindowStartsAt', () => {
  it('returns the next six-hour UTC window', () => {
    expect(getNextAutoSyncWindowStartsAt(new Date('2026-06-20T05:59:00.000Z')).toISOString()).toBe('2026-06-20T06:00:00.000Z')
    expect(getNextAutoSyncWindowStartsAt(new Date('2026-06-20T06:00:00.000Z')).toISOString()).toBe('2026-06-20T06:00:00.000Z')
    expect(getNextAutoSyncWindowStartsAt(new Date('2026-06-20T23:59:00.000Z')).toISOString()).toBe('2026-06-21T00:00:00.000Z')
  })
})

describe('loadAiConfig', () => {
  it('defaults to disabled AI', () => {
    expect(loadAiConfig({})).toMatchObject({
      deploymentMode: 'self-hosted',
      provider: 'disabled',
    })
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
    expect(() => loadAiConfig({ AI_PROVIDER: 'openai-compatible', AI_MODEL: 'gpt-4.1-mini' })).toThrow(/AI_API_KEY/)
  })

  it('rejects managed AI until runtime support exists', () => {
    expect(() => loadAiConfig({ DEPLOYMENT_MODE: 'cloud', AI_PROVIDER: 'managed', AI_MODEL: 'gpt-4.1-mini' })).toThrow(/not supported/)
  })

  it('rejects non-local HTTP AI base URLs', () => {
    expect(() =>
      loadAiConfig({
        AI_PROVIDER: 'openai-compatible',
        AI_MODEL: 'gpt-4.1-mini',
        AI_API_KEY: 'test-key',
        AI_BASE_URL: 'http://example.com/v1',
      }),
    ).toThrow(/HTTPS/)
  })

  it('rejects AI base URLs with credentials', () => {
    expect(() =>
      loadAiConfig({
        AI_PROVIDER: 'openai-compatible',
        AI_MODEL: 'gpt-4.1-mini',
        AI_API_KEY: 'test-key',
        AI_BASE_URL: 'https://user:pass@example.com/v1',
      }),
    ).toThrow(/credentials/)
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
    expect(() => loadEncryptionConfig({ APP_ENCRYPTION_KEY: Buffer.alloc(16, 1).toString('base64') })).toThrow(/32 bytes/)
  })
})
