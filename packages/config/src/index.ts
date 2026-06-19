import { z } from 'zod'

export const deploymentModeSchema = z.enum(['self-hosted', 'cloud'])

export type DeploymentMode = z.infer<typeof deploymentModeSchema>

const localOrigins = new Set(['http://localhost', 'http://127.0.0.1'])

const booleanEnvSchema = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true')

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
  })
  .superRefine((config, context) => {
    if ((config.smtpHost && !config.mailFrom) || (!config.smtpHost && config.mailFrom)) {
      context.addIssue({
        code: 'custom',
        path: ['mailFrom'],
        message: 'MAIL_FROM and SMTP_HOST must be configured together to enable invitation email delivery.',
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

export function loadServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
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
  })
}

export function loadEncryptionConfig(env: NodeJS.ProcessEnv = process.env): EncryptionConfig {
  return encryptionConfigSchema.parse({
    appEncryptionKey: env['APP_ENCRYPTION_KEY'],
  })
}
