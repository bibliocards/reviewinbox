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
    throw new Error(
      `APP_PUBLIC_URL must be an origin without path, query, hash, or credentials: ${origin}`,
    )
  }

  if (url.protocol !== 'https:' && !isLocalHttpOrigin(origin)) {
    throw new Error(`APP_PUBLIC_URL must use HTTPS unless it is local: ${origin}`)
  }

  return origin
}

function isLocalHttpUrl(url: URL) {
  return url.protocol === 'http:' && localOrigins.has(`${url.protocol}//${url.hostname}`)
}

const serverConfigBaseSchema = z.object({
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
        .map((origin) => parseOrigin(origin)),
    ),
  mailFrom: optionalStringSchema,
  smtpHost: optionalStringSchema,
  smtpPort: z.coerce.number().int().min(1).max(65535).default(587),
  smtpUser: optionalStringSchema,
  smtpPassword: optionalStringSchema,
  smtpSecure: booleanEnvSchema,
  replyDraftWorkerEnabled: booleanEnvSchema,
  autoSyncReviewsEnabled: enabledBooleanEnvSchema,
  autoSyncReviewsSpreadWindowMinutes: z.coerce.number().int().min(1).max(360).default(60),
  uploadLocalDir: z.string().default('volumes/uploads'),
  s3Region: optionalStringSchema,
  s3Bucket: optionalStringSchema,
  s3Endpoint: optionalStringSchema,
  s3AccessKeyId: optionalStringSchema,
  s3SecretAccessKey: optionalStringSchema,
  s3PublicBaseUrl: optionalStringSchema,
  stripeSecretKey: optionalStringSchema,
  stripeWebhookSecret: optionalStringSchema,
  stripeStarterPriceId: optionalStringSchema,
  stripeStarterAnnualPriceId: optionalStringSchema,
  stripeProPriceId: optionalStringSchema,
  stripeProAnnualPriceId: optionalStringSchema,
  stripeBusinessPriceId: optionalStringSchema,
  stripeBusinessAnnualPriceId: optionalStringSchema,
})

type ServerConfigValues = z.infer<typeof serverConfigBaseSchema>
type RefinementContext = {
  addIssue: (issue: { code: 'custom'; message: string; path?: string[] }) => void
}

export const serverConfigSchema = serverConfigBaseSchema.superRefine((config, context) => {
  validateMailConfig(config, context)
  validateStorageConfig(config, context)
  validateStripeConfig(config, context)
  validateCloudServerConfig(config, context)
})

function validateMailConfig(config: ServerConfigValues, context: RefinementContext): void {
  const hasMailFrom = config.mailFrom !== undefined
  const hasSmtpHost = config.smtpHost !== undefined
  if (hasMailFrom === hasSmtpHost) {
    return
  }

  addCustomIssue(
    context,
    ['mailFrom'],
    'MAIL_FROM and SMTP_HOST must be configured together to enable invitation email delivery.',
  )
}

function validateStorageConfig(config: ServerConfigValues, context: RefinementContext): void {
  const storageValues = [
    config.s3Region,
    config.s3Bucket,
    config.s3AccessKeyId,
    config.s3SecretAccessKey,
  ]
  const hasStorageValue = storageValues.some((value) => value !== undefined)
  const hasCompleteStorageConfig = storageValues.every((value) => value !== undefined)
  if (!hasStorageValue || hasCompleteStorageConfig) {
    return
  }

  addCustomIssue(
    context,
    ['s3Bucket'],
    'S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY must be configured together.',
  )
}

function validateStripeConfig(config: ServerConfigValues, context: RefinementContext): void {
  const stripeSecretValues = [config.stripeSecretKey, config.stripeWebhookSecret]
  const hasStripeSecrets = stripeSecretValues.every((value) => value !== undefined)
  const hasAnyStripeSecret = stripeSecretValues.some((value) => value !== undefined)
  const hasAnyStripePlan = hasConfiguredStripePlan(config)
  const hasPartialStripePlan = hasPartialStripePlanConfigured(config)

  validateStripeSecrets(context, hasAnyStripeSecret, hasStripeSecrets)
  validateStripePlans(context, hasStripeSecrets, hasAnyStripePlan, hasPartialStripePlan)
  if (config.deploymentMode === 'cloud' && (!hasStripeSecrets || !hasAnyStripePlan)) {
    addCustomIssue(
      context,
      ['stripeSecretKey'],
      'Cloud deployments must configure Stripe billing with at least one plan.',
    )
  }
}

function hasConfiguredStripePlan(config: ServerConfigValues): boolean {
  return [
    [config.stripeStarterPriceId, config.stripeStarterAnnualPriceId],
    [config.stripeProPriceId, config.stripeProAnnualPriceId],
    [config.stripeBusinessPriceId, config.stripeBusinessAnnualPriceId],
  ].some(
    ([monthlyPriceId, annualPriceId]) =>
      monthlyPriceId !== undefined && annualPriceId !== undefined,
  )
}

function hasPartialStripePlanConfigured(config: ServerConfigValues): boolean {
  return [
    [config.stripeStarterPriceId, config.stripeStarterAnnualPriceId],
    [config.stripeProPriceId, config.stripeProAnnualPriceId],
    [config.stripeBusinessPriceId, config.stripeBusinessAnnualPriceId],
  ].some(
    ([monthlyPriceId, annualPriceId]) =>
      (monthlyPriceId !== undefined) !== (annualPriceId !== undefined),
  )
}

function validateStripeSecrets(
  context: RefinementContext,
  hasAnyStripeSecret: boolean,
  hasStripeSecrets: boolean,
): void {
  if (hasAnyStripeSecret && !hasStripeSecrets) {
    addCustomIssue(
      context,
      ['stripeSecretKey'],
      'STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET must be configured together.',
    )
  }
}

function validateStripePlans(
  context: RefinementContext,
  hasStripeSecrets: boolean,
  hasAnyStripePlan: boolean,
  hasPartialStripePlan: boolean,
): void {
  if (hasPartialStripePlan) {
    addCustomIssue(
      context,
      ['stripeStarterPriceId'],
      'Each enabled Stripe plan must configure both monthly and annual price IDs.',
    )
  }
  if (hasStripeSecrets && !hasAnyStripePlan) {
    addCustomIssue(
      context,
      ['stripeStarterPriceId'],
      'Stripe billing requires at least one configured plan price pair.',
    )
  }
  if (hasAnyStripePlan && !hasStripeSecrets) {
    addCustomIssue(
      context,
      ['stripeSecretKey'],
      'Stripe plan prices require STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.',
    )
  }
}

function validateCloudServerConfig(config: ServerConfigValues, context: RefinementContext): void {
  if (config.deploymentMode !== 'cloud') {
    return
  }

  validateCloudOrigin(
    config.appPublicUrl,
    context,
    ['appPublicUrl'],
    'Cloud deployments must set APP_PUBLIC_URL to an HTTPS origin unless it is local.',
  )
  validateCloudOrigin(
    config.betterAuthUrl,
    context,
    ['betterAuthUrl'],
    'Cloud deployments must set BETTER_AUTH_URL to an HTTPS origin unless it is local.',
  )
  for (const origin of config.betterAuthTrustedOrigins) {
    validateCloudOrigin(
      origin,
      context,
      ['betterAuthTrustedOrigins'],
      'Cloud deployments must only trust HTTPS origins unless they are local.',
    )
  }
}

function validateCloudOrigin(
  origin: string,
  context: RefinementContext,
  path: string[],
  message: string,
): void {
  const url = new URL(origin)
  if (url.protocol === 'https:' || isLocalHttpOrigin(origin)) {
    return
  }

  addCustomIssue(context, path, message)
}

function addCustomIssue(context: RefinementContext, path: string[], message: string): void {
  context.addIssue({ code: 'custom', path, message })
}

export type ServerConfig = z.infer<typeof serverConfigSchema>

export const workerConfigSchema = z.object({
  deploymentMode: deploymentModeSchema.default('self-hosted'),
  databaseUrl: z.url().default('postgres://reviewinbox:reviewinbox@localhost:5432/reviewinbox'),
  runDatabaseMigrationsOnStartup: booleanEnvSchema,
  autoSyncReviewsEnabled: enabledBooleanEnvSchema,
  autoSyncReviewsSpreadWindowMinutes: z.coerce.number().int().min(1).max(360).default(60),
})

export type WorkerConfig = z.infer<typeof workerConfigSchema>

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

const aiConfigBaseSchema = z.object({
  deploymentMode: deploymentModeSchema.default('self-hosted'),
  provider: aiProviderKindSchema.default('disabled'),
  model: optionalStringSchema,
  apiKey: optionalStringSchema,
  baseUrl: optionalStringSchema,
})

type AiConfigValues = z.infer<typeof aiConfigBaseSchema>

export const aiConfigSchema = aiConfigBaseSchema.superRefine((config, context) => {
  if (!validateAiBaseUrl(config, context)) {
    return
  }

  validateAiProvider(config, context)
})

function validateAiBaseUrl(config: AiConfigValues, context: RefinementContext): boolean {
  if (config.baseUrl === undefined) {
    return true
  }

  const baseUrl = parseAiBaseUrl(config.baseUrl, context)
  if (baseUrl === undefined) {
    return false
  }

  validateAiUrlSecurity(config, baseUrl, context)
  return true
}

function parseAiBaseUrl(value: string, context: RefinementContext): URL | undefined {
  try {
    return new URL(value)
  } catch {
    addCustomIssue(context, ['baseUrl'], 'AI_BASE_URL must be a valid URL.')
    return undefined
  }
}

function validateAiUrlSecurity(
  config: AiConfigValues,
  baseUrl: URL,
  context: RefinementContext,
): void {
  const hasCredentials = baseUrl.username !== '' || baseUrl.password !== ''
  const hasQueryOrHash = baseUrl.search !== '' || baseUrl.hash !== ''
  if (hasCredentials || hasQueryOrHash) {
    addCustomIssue(
      context,
      ['baseUrl'],
      'AI_BASE_URL must not include credentials, query, or hash.',
    )
  }

  if (config.deploymentMode === 'cloud' && baseUrl.protocol !== 'https:') {
    addCustomIssue(context, ['baseUrl'], 'Cloud deployments must use HTTPS AI_BASE_URL values.')
  }

  const isInsecureSelfHostedUrl =
    config.deploymentMode !== 'cloud' && baseUrl.protocol !== 'https:' && !isLocalHttpUrl(baseUrl)
  if (isInsecureSelfHostedUrl) {
    addCustomIssue(
      context,
      ['baseUrl'],
      'AI_BASE_URL must use HTTPS unless it is a local self-hosted URL.',
    )
  }
}

function validateAiProvider(config: AiConfigValues, context: RefinementContext): void {
  if (config.provider === 'disabled') {
    return
  }

  if (config.model === undefined) {
    addCustomIssue(context, ['model'], 'AI_MODEL is required when AI_PROVIDER is enabled.')
  }
  if (config.provider === 'managed' && config.deploymentMode !== 'cloud') {
    addCustomIssue(
      context,
      ['provider'],
      'AI_PROVIDER=managed is only available in cloud deployments.',
    )
  }
  if (config.apiKey === undefined) {
    addCustomIssue(
      context,
      ['apiKey'],
      `AI_API_KEY is required when AI_PROVIDER=${config.provider}.`,
    )
  }
}

export type AiConfig = z.infer<typeof aiConfigSchema>

export const appEncryptionKeySchema = z.string().superRefine((value, context) => {
  let decoded: Buffer

  try {
    decoded = Buffer.from(value, 'base64')
  } catch {
    context.addIssue({ code: 'custom', message: 'APP_ENCRYPTION_KEY must be base64-encoded.' })
    return
  }

  if (decoded.length !== 32 || decoded.toString('base64') !== value) {
    context.addIssue({
      code: 'custom',
      message: 'APP_ENCRYPTION_KEY must decode to exactly 32 bytes for AES-256-GCM.',
    })
  }
})

export const encryptionConfigSchema = z.object({ appEncryptionKey: appEncryptionKeySchema })

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
    replyDraftWorkerEnabled: env['REPLY_DRAFT_WORKER_ENABLED'],
    autoSyncReviewsEnabled: env['AUTO_SYNC_REVIEWS_ENABLED'],
    autoSyncReviewsSpreadWindowMinutes: env['AUTO_SYNC_REVIEWS_SPREAD_WINDOW_MINUTES'],
    uploadLocalDir: env['UPLOAD_LOCAL_DIR'],
    s3Region: env['S3_REGION'],
    s3Bucket: env['S3_BUCKET'],
    s3Endpoint: env['S3_ENDPOINT'],
    s3AccessKeyId: env['S3_ACCESS_KEY_ID'],
    s3SecretAccessKey: env['S3_SECRET_ACCESS_KEY'],
    s3PublicBaseUrl: env['S3_PUBLIC_BASE_URL'],
    stripeSecretKey: env['STRIPE_SECRET_KEY'],
    stripeWebhookSecret: env['STRIPE_WEBHOOK_SECRET'],
    stripeStarterPriceId: env['STRIPE_STARTER_PRICE_ID'],
    stripeStarterAnnualPriceId: env['STRIPE_STARTER_ANNUAL_PRICE_ID'],
    stripeProPriceId: env['STRIPE_PRO_PRICE_ID'],
    stripeProAnnualPriceId: env['STRIPE_PRO_ANNUAL_PRICE_ID'],
    stripeBusinessPriceId: env['STRIPE_BUSINESS_PRICE_ID'],
    stripeBusinessAnnualPriceId: env['STRIPE_BUSINESS_ANNUAL_PRICE_ID'],
  })
}

export function loadWorkerConfig(env: NodeJS.ProcessEnv = loadProcessEnv()): WorkerConfig {
  return workerConfigSchema.parse({
    deploymentMode: env['DEPLOYMENT_MODE'],
    databaseUrl: env['DATABASE_URL'],
    runDatabaseMigrationsOnStartup: env['RUN_DB_MIGRATIONS_ON_STARTUP'],
    autoSyncReviewsEnabled: env['AUTO_SYNC_REVIEWS_ENABLED'],
    autoSyncReviewsSpreadWindowMinutes: env['AUTO_SYNC_REVIEWS_SPREAD_WINDOW_MINUTES'],
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
  return encryptionConfigSchema.parse({ appEncryptionKey: env['APP_ENCRYPTION_KEY'] })
}

function loadProcessEnv(): NodeJS.ProcessEnv {
  if (!envFileLoaded) {
    envFileLoaded = true
    const envFile = process.env['REVIEWINBOX_ENV_FILE'] ?? '.env'
    try {
      process.loadEnvFile(envFile)
    } catch (error) {
      if (!(error instanceof Error) || !isMissingEnvFileError(error)) {
        throw error
      }
    }
  }

  return process.env
}

function isMissingEnvFileError(error: Error): boolean {
  return 'code' in error && error.code === 'ENOENT'
}
