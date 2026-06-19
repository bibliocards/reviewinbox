import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { organization } from 'better-auth/plugins/organization'
import { databaseSchema } from '@reviewinbox/db'

import { database, serverConfig } from './db'

const rateLimitStorage = process.env['NODE_ENV'] === 'test' ? 'memory' : 'database'

export const auth = betterAuth({
  appName: 'ReviewInbox',
  basePath: '/auth',
  baseURL: serverConfig.betterAuthUrl,
  database: drizzleAdapter(database, {
    provider: 'pg',
    schema: databaseSchema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [organization()],
  rateLimit: {
    enabled: true,
    storage: rateLimitStorage,
  },
  secret: serverConfig.betterAuthSecret,
  trustedOrigins: serverConfig.betterAuthTrustedOrigins,
})

export type AuthSession = typeof auth.$Infer.Session
