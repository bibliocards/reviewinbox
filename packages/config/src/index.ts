import { z } from 'zod'

let envFileLoaded = false

export const deploymentModeSchema = z.enum(['self-hosted', 'cloud'])

export type DeploymentMode = z.infer<typeof deploymentModeSchema>

export const aiProviderKindSchema = z.enum(['disabled', 'managed', 'openai-compatible'])

export type AiProviderKind = z.infer<typeof aiProviderKindSchema>

const localOrigins = new Set(['http://localhost', 'http://127.0.0.1'])

const booleanEnvSchema = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true')

const enabledBooleanEnvSchema = z
  .enum(['true', 'false'])
  .default('true')
  .transform((value) => value === 'true')

const autoSyncWindowStartHours = [0, 6, 12, 18] as const

const optionalStringSchema = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : undefined))
  .optional()

function isLocalHttpOrigin(origin: string) {
  const url = new URL(origin)
  return url.protocol === 'http:' && localOrigins.has(`${url.protocol}//${url.hostname}`)
}

function parseOrigin(origin: string) {
  const url = new URL(origin)

  if (url.origin !== origin) {
    throw new Error(`Trusted origin must not include a path: ${origin}`)
  }

  if (url.protocol !== 'https:' && !isLocalHttpOrigin(origin)) {
    throw new Error(`Trusted origin must use HTTPS unless it is local: ${origin}`)
  }

  return origin
}

function parseAppPublicOrigin(origin: string) {
  const url = new URL(origin)

  if (url.origin !== origin) {
    throw new Error(`APP_PUBLIC_URL must be an origin without path, query, hash, or credentials: ${origin}`)
  }

  if (url.protocol !== 'https:' && !isLocalHttpOrigin(origin)) {
    throw new Error(`APP_PUBLIC_URL must use HTTPS unless it is local: ${origin}`)
  }

  return origin
}

function isLocalHttpUrl(url: URL) {
  return url.protocol === 'http:' && localOrigins.has(`${url.protocol}//${url.hostname}`)
}

export const serverConfigSchema = z
  .object({
    deploymentMode: deploymentModeSchema.default('self-hosted'),
    databaseUrl: z.url().default('postgres://reviewinbox:reviewinbox@localhost:5432/reviewinbox'),
    runDatabaseMigrationsOnStartup: booleanEnvSchema,
    apiHost: z.string().default('127.0.0.1'),
    apiPort: z.coerce.number().int().min(1).max(65535).default(3000),
    appPublicUrl: z.string().default('http://localhost:4200').transform(parseAppPublicOrigin),
    betterAuthSecret: z.string().min(32).optional(),
    betterAuthUrl: z.url().default('http://127.0.0.1:3000'),
    betterAuthTrustedOrigins: z
      .string()
      .default('http://localhost:4200,http://127.0.0.1:4200')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter((origin) => origin.length > 0)
          .map(parseOrigin),
      ),
    mailFrom: optionalStringSchema,
    smtpHost: optionalStringSchema,
    smtpPort: z.coerce.number().int().min(1).max(65535).default(587),
    smtpUser: optionalStringSchema,
    smtpPassword: optionalStringSchema,
    smtpSecure: booleanEnvSchema,
    autoSyncReviewsEnabled: enabledBooleanEnvSchema,
    autoSyncReviewsSpreadWindowMinutes: z.coerce.number().int().min(1).max(360).default(60),
    uploadLocalDir: z.string().default('volumes/uploads'),
    s3Region: optionalStringSchema,
    s3Bucket: optionalStringSchema,
    s3Endpoint: optionalStringSchema,
    s3AccessKeyId: optionalStringSchema,
    s3SecretAccessKey: optionalStringSchema,
    s3PublicBaseUrl: optionalStringSchema,
  })
  .superRefine((config, context) => {
    if ((config.smtpHost && !config.mailFrom) || (!config.smtpHost && config.mailFrom)) {
      context.addIssue({
        code: 'custom',
        path: ['mailFrom'],
        message: 'MAIL_FROM and SMTP_HOST must be configured together to enable invitation email delivery.',
      })
    }

    const s3Values = [config.s3Region, config.s3Bucket, config.s3AccessKeyId, config.s3SecretAccessKey]
    if (s3Values.some(Boolean) && !s3Values.every(Boolean)) {
      context.addIssue({
        code: 'custom',
        path: ['s3Bucket'],
        message: 'S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY must be configured together.',
      })
    }

    if (config.deploymentMode !== 'cloud') {
      return
    }

    if (new URL(config.appPublicUrl).protocol !== 'https:') {
      context.addIssue({
        code: 'custom',
        path: ['appPublicUrl'],
        message: 'Cloud deployments must set APP_PUBLIC_URL to an HTTPS origin.',
      })
    }

    if (new URL(config.betterAuthUrl).protocol !== 'https:') {
      context.addIssue({
        code: 'custom',
        path: ['betterAuthUrl'],
        message: 'Cloud deployments must set BETTER_AUTH_URL to an HTTPS origin.',
      })
    }

    for (const origin of config.betterAuthTrustedOrigins) {
      if (new URL(origin).protocol !== 'https:') {
        context.addIssue({
          code: 'custom',
          path: ['betterAuthTrustedOrigins'],
          message: 'Cloud deployments must only trust HTTPS origins.',
        })
      }
    }
  })

export type ServerConfig = z.infer<typeof serverConfigSchema>

export function getNextAutoSyncWindowStartsAt(now = new Date()): Date {
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const date = now.getUTCDate()

  for (const hour of autoSyncWindowStartHours) {
    const candidate = new Date(Date.UTC(year, month, date, hour))
    if (candidate.getTime() >= now.getTime()) {
      return candidate
    }
  }

  return new Date(Date.UTC(year, month, date + 1, autoSyncWindowStartHours[0]))
}

export const aiConfigSchema = z
  .object({
    deploymentMode: deploymentModeSchema.default('self-hosted'),
    provider: aiProviderKindSchema.default('disabled'),
    model: optionalStringSchema,
    apiKey: optionalStringSchema,
    baseUrl: optionalStringSchema,
  })
  .superRefine((config, context) => {
    if (config.baseUrl) {
      let baseUrl: URL
      try {
        baseUrl = new URL(config.baseUrl)
      } catch {
        context.addIssue({
          code: 'custom',
          path: ['baseUrl'],
          message: 'AI_BASE_URL must be a valid URL.',
        })
        return
      }

      if (baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
        context.addIssue({
          code: 'custom',
          path: ['baseUrl'],
          message: 'AI_BASE_URL must not include credentials, query, or hash.',
        })
      }

      if (config.deploymentMode === 'cloud' && baseUrl.protocol !== 'https:') {
        context.addIssue({
          code: 'custom',
          path: ['baseUrl'],
          message: 'Cloud deployments must use HTTPS AI_BASE_URL values.',
        })
      }

      if (config.deploymentMode !== 'cloud' && baseUrl.protocol !== 'https:' && !isLocalHttpUrl(baseUrl)) {
        context.addIssue({
          code: 'custom',
          path: ['baseUrl'],
          message: 'AI_BASE_URL must use HTTPS unless it is a local self-hosted URL.',
        })
      }
    }

    if (config.provider === 'disabled') {
      return
    }

    if (!config.model) {
      context.addIssue({
        code: 'custom',
        path: ['model'],
        message: 'AI_MODEL is required when AI_PROVIDER is enabled.',
      })
    }

    if (config.provider === 'managed') {
      context.addIssue({
        code: 'custom',
        path: ['provider'],
        message: 'AI_PROVIDER=managed is reserved for cloud deployments but is not supported by this runtime yet.',
      })
      return
    }

    if (config.provider === 'openai-compatible' && !config.apiKey) {
      context.addIssue({
        code: 'custom',
        path: ['apiKey'],
        message: 'AI_API_KEY is required when AI_PROVIDER=openai-compatible.',
      })
    }
  })

export type AiConfig = z.infer<typeof aiConfigSchema>

export const appEncryptionKeySchema = z.string().superRefine((value, context) => {
  let decoded: Buffer

  try {
    decoded = Buffer.from(value, 'base64')
  } catch {
    context.addIssue({
      code: 'custom',
      message: 'APP_ENCRYPTION_KEY must be base64-encoded.',
    })
    return
  }

  if (decoded.length !== 32 || decoded.toString('base64') !== value) {
    context.addIssue({
      code: 'custom',
      message: 'APP_ENCRYPTION_KEY must decode to exactly 32 bytes for AES-256-GCM.',
    })
  }
})

export const encryptionConfigSchema = z.object({
  appEncryptionKey: appEncryptionKeySchema,
})

export type EncryptionConfig = z.infer<typeof encryptionConfigSchema>

export function loadServerConfig(env: NodeJS.ProcessEnv = loadProcessEnv()): ServerConfig {
  return serverConfigSchema.parse({
    deploymentMode: env['DEPLOYMENT_MODE'],
    databaseUrl: env['DATABASE_URL'],
    runDatabaseMigrationsOnStartup: env['RUN_DB_MIGRATIONS_ON_STARTUP'],
    apiHost: env['API_HOST'],
    apiPort: env['API_PORT'],
    appPublicUrl: env['APP_PUBLIC_URL'],
    betterAuthSecret: env['BETTER_AUTH_SECRET'],
    betterAuthUrl: env['BETTER_AUTH_URL'],
    betterAuthTrustedOrigins: env['BETTER_AUTH_TRUSTED_ORIGINS'],
    mailFrom: env['MAIL_FROM'],
    smtpHost: env['SMTP_HOST'],
    smtpPort: env['SMTP_PORT'],
    smtpUser: env['SMTP_USER'],
    smtpPassword: env['SMTP_PASSWORD'],
    smtpSecure: env['SMTP_SECURE'],
    autoSyncReviewsEnabled: env['AUTO_SYNC_REVIEWS_ENABLED'],
    autoSyncReviewsSpreadWindowMinutes: env['AUTO_SYNC_REVIEWS_SPREAD_WINDOW_MINUTES'],
    uploadLocalDir: env['UPLOAD_LOCAL_DIR'],
    s3Region: env['S3_REGION'],
    s3Bucket: env['S3_BUCKET'],
    s3Endpoint: env['S3_ENDPOINT'],
    s3AccessKeyId: env['S3_ACCESS_KEY_ID'],
    s3SecretAccessKey: env['S3_SECRET_ACCESS_KEY'],
    s3PublicBaseUrl: env['S3_PUBLIC_BASE_URL'],
  })
}

export function loadAiConfig(env: NodeJS.ProcessEnv = loadProcessEnv()): AiConfig {
  return aiConfigSchema.parse({
    deploymentMode: env['DEPLOYMENT_MODE'],
    provider: env['AI_PROVIDER'],
    model: env['AI_MODEL'],
    apiKey: env['AI_API_KEY'],
    baseUrl: env['AI_BASE_URL'],
  })
}

export function loadEncryptionConfig(env: NodeJS.ProcessEnv = loadProcessEnv()): EncryptionConfig {
  return encryptionConfigSchema.parse({
    appEncryptionKey: env['APP_ENCRYPTION_KEY'],
  })
}

function loadProcessEnv(): NodeJS.ProcessEnv {
  if (!envFileLoaded) {
    envFileLoaded = true
    try {
      process.loadEnvFile('.env')
    } catch (error) {
      if (!isMissingEnvFileError(error)) {
        throw error
      }
    }
  }

  return process.env
}

function isMissingEnvFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
