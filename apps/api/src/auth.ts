import { getEffectiveOrganizationLimits, planDefinitions, type PlanName } from '@reviewinbox/billing'
import type { StripePlan } from '@better-auth/stripe'
import { databaseSchema, member, organization as organizationTable } from '@reviewinbox/db'
import { stripe, type Subscription } from '@better-auth/stripe'
import { and, eq } from 'drizzle-orm'
import { APIError } from 'better-auth/api'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { organization } from 'better-auth/plugins/organization'
import Stripe from 'stripe'

import { database, serverConfig } from './db'
import { invitationLink, sendInvitationEmail } from './mail'

const rateLimitStorage = process.env['NODE_ENV'] === 'test' ? 'memory' : 'database'
type StripeRuntimeConfig = {
  stripeSecretKey: string
  stripeWebhookSecret: string
  plans: StripePlan[]
}

const authPlugins = [
  organization({
    requireEmailVerificationOnInvitation: false,
    async membershipLimit(_user, org) {
      if (serverConfig.deploymentMode === 'self-hosted') {
        return Number.MAX_SAFE_INTEGER
      }

      const row = await database.query.organization.findFirst({
        columns: { planName: true, billingOverrides: true },
        where: eq(organizationTable.id, org.id),
      })

      if (!row) {
        return 0
      }

      return getEffectiveOrganizationLimits(row.planName, row.billingOverrides).memberLimit
    },
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
  organizationBillingOnlyPlugin(),
  ...createStripePlugins(),
]

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
  plugins: authPlugins,
  rateLimit: {
    enabled: true,
    storage: rateLimitStorage,
  },
  secret: serverConfig.betterAuthSecret,
  trustedOrigins: serverConfig.betterAuthTrustedOrigins,
})

export type AuthSession = typeof auth.$Infer.Session

function createStripePlugins() {
  const stripeConfig = getStripeConfig()
  if (!stripeConfig) {
    return []
  }

  const stripeClient = new Stripe(stripeConfig.stripeSecretKey, {
    apiVersion: '2026-05-27.dahlia',
  })

  return [
    stripe({
      stripeClient,
      stripeWebhookSecret: stripeConfig.stripeWebhookSecret,
      createCustomerOnSignUp: false,
      organization: {
        enabled: true,
      },
      subscription: {
        enabled: true,
        plans: stripeConfig.plans,
        async authorizeReference({ user, referenceId }) {
          const membership = await database.query.member.findFirst({
            columns: { role: true },
            where: and(eq(member.userId, user.id), eq(member.organizationId, referenceId)),
          })

          return membership ? ['owner', 'admin'].includes(membership.role) : false
        },
        async onSubscriptionComplete({ subscription }) {
          await syncOrganizationPlan(subscription)
        },
        async onSubscriptionCreated({ subscription }) {
          await syncOrganizationPlan(subscription)
        },
        async onSubscriptionUpdate({ subscription }) {
          await syncOrganizationPlan(subscription)
        },
        async onSubscriptionDeleted({ subscription }) {
          await syncOrganizationPlan({ ...subscription, status: 'canceled' })
        },
        getCheckoutSessionParams() {
          return {
            params: {
              automatic_tax: {
                enabled: true,
              },
              customer_update: {
                address: 'auto',
                name: 'auto',
              },
              tax_id_collection: {
                enabled: true,
              },
            },
          }
        },
      },
    }),
  ]
}

function getStripeConfig(): StripeRuntimeConfig | null {
  if (!serverConfig.stripeSecretKey || !serverConfig.stripeWebhookSecret) {
    return null
  }

  const plans = [
    stripePlan('starter', serverConfig.stripeStarterPriceId, serverConfig.stripeStarterAnnualPriceId),
    stripePlan('pro', serverConfig.stripeProPriceId, serverConfig.stripeProAnnualPriceId),
    stripePlan('business', serverConfig.stripeBusinessPriceId, serverConfig.stripeBusinessAnnualPriceId),
  ].filter((plan): plan is StripePlan => Boolean(plan))

  if (plans.length === 0) {
    return null
  }

  return {
    stripeSecretKey: serverConfig.stripeSecretKey,
    stripeWebhookSecret: serverConfig.stripeWebhookSecret,
    plans,
  }
}

function stripePlan(planName: Exclude<PlanName, 'free'>, priceId?: string, annualDiscountPriceId?: string): StripePlan | null {
  if (!priceId || !annualDiscountPriceId) {
    return null
  }

  return {
    name: planName,
    priceId,
    annualDiscountPriceId,
    limits: planDefinitions[planName],
  }
}

function organizationBillingOnlyPlugin() {
  const subscriptionPaths = new Set([
    '/subscription/upgrade',
    '/subscription/list',
    '/subscription/cancel',
    '/subscription/restore',
    '/subscription/billing-portal',
  ])

  return {
    id: 'reviewinbox-organization-billing-only',
    hooks: {
      before: [
        {
          matcher(context: { path?: string }) {
            return typeof context.path === 'string' && subscriptionPaths.has(context.path)
          },
          handler: async (context: unknown) => {
            if (!isOrganizationBillingRequest(context)) {
              throw new APIError('BAD_REQUEST', {
                message: 'ReviewInbox billing is only available for Organizations.',
              })
            }

            if (!hasSafeBillingRedirectUrls(context)) {
              throw new APIError('BAD_REQUEST', {
                message: 'Billing redirects must stay within ReviewInbox.',
              })
            }
          },
        },
      ],
    },
  }
}

function isOrganizationBillingRequest(context: unknown): boolean {
  const data = context as { path?: string; body?: { customerType?: unknown }; query?: { customerType?: unknown } }
  if (data.path === '/subscription/list') {
    return data.query?.customerType === 'organization' && !data.body?.customerType
  }

  return data.body?.customerType === 'organization' && (!data.query?.customerType || data.query.customerType === 'organization')
}

function hasSafeBillingRedirectUrls(context: unknown): boolean {
  const body = (context as { body?: { successUrl?: unknown; cancelUrl?: unknown; returnUrl?: unknown } }).body
  return [body?.successUrl, body?.cancelUrl, body?.returnUrl].every(isSafeBillingRedirectUrl)
}

function isSafeBillingRedirectUrl(value: unknown): boolean {
  if (value === undefined) {
    return true
  }

  if (typeof value !== 'string') {
    return false
  }

  if (value.startsWith('/') && !value.startsWith('//')) {
    return true
  }

  try {
    return new URL(value).origin === serverConfig.appPublicUrl
  } catch {
    return false
  }
}

async function syncOrganizationPlan(subscription: Subscription): Promise<void> {
  if (subscription.status !== 'active' && subscription.status !== 'trialing') {
    await database.update(organizationTable).set({ planName: 'free' }).where(eq(organizationTable.id, subscription.referenceId))
    return
  }

  if (!isPlanName(subscription.plan) || subscription.plan === 'free') {
    await database.update(organizationTable).set({ planName: 'free' }).where(eq(organizationTable.id, subscription.referenceId))
    return
  }

  await database.update(organizationTable).set({ planName: subscription.plan }).where(eq(organizationTable.id, subscription.referenceId))
}

function isPlanName(planName: string): planName is PlanName {
  return planName === 'free' || planName === 'starter' || planName === 'pro' || planName === 'business'
}
