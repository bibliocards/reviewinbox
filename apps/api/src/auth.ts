import { databaseSchema } from '@reviewinbox/db'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { organization } from 'better-auth/plugins/organization'

import { database, serverConfig } from './db'
import { invitationLink, sendInvitationEmail } from './mail'

const rateLimitStorage = process.env['NODE_ENV'] === 'test' ? 'memory' : 'database'

export const auth = betterAuth({
  appName: 'ReviewInbox',
  basePath: '/api/auth',
  baseURL: serverConfig.betterAuthUrl,
  database: drizzleAdapter(database, {
    provider: 'pg',
    schema: databaseSchema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    organization({
      requireEmailVerificationOnInvitation: false,
      async sendInvitationEmail(data) {
        await sendInvitationEmail(
          {
            email: data.email,
            invitedByEmail: data.inviter.user.email,
            invitedByName: data.inviter.user.name,
            inviteLink: invitationLink(data.id, serverConfig),
            organizationName: data.organization.name,
          },
          serverConfig,
        )
      },
    }),
  ],
  rateLimit: {
    enabled: true,
    storage: rateLimitStorage,
  },
  secret: serverConfig.betterAuthSecret,
  trustedOrigins: serverConfig.betterAuthTrustedOrigins,
})

export type AuthSession = typeof auth.$Infer.Session
