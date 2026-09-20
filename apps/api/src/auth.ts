import type { StripePlan } from '@better-auth/stripe'
import { stripe, type Subscription } from '@better-auth/stripe'
import {
  getEffectiveOrganizationLimits,
  planDefinitions,
  type PlanName,
} from '@reviewinbox/billing'
import { databaseSchema, member, organization as organizationTable } from '@reviewinbox/db'
import { betterAuth, type Auth, type BetterAuthOptions } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError } from 'better-auth/api'
import { organization } from 'better-auth/plugins/organization'
import { and, eq } from 'drizzle-orm'
import { Stripe as StripeClient } from 'stripe'
import { z } from 'zod'

import { database, serverConfig } from './db'
import {
  dispatchPasswordResetEmail,
  invitationLink,
  passwordResetEmailEnabled,
  sendInvitationEmail,
} from './mail'

const rateLimitStorage = process.env['NODE_ENV'] === 'test' ? 'memory' : 'database'
type StripeRuntimeConfig = {
  stripeSecretKey: string
  stripeWebhookSecret: string
  plans: StripePlan[]
}

const authPlugins = [
  organization({
    disableOrganizationDeletion: true,
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

const authDatabase: ReturnType<typeof drizzleAdapter> = drizzleAdapter(database, {
  provider: 'pg',
  schema: databaseSchema,
})

type ReviewInboxAuthOptions = BetterAuthOptions & {
  plugins: typeof authPlugins
  emailAndPassword: ReturnType<typeof createEmailAndPasswordConfig>
}

const authOptions: ReviewInboxAuthOptions = {
  appName: 'ReviewInbox',
  basePath: '/api/auth',
  baseURL: serverConfig.betterAuthUrl,
  database: authDatabase,
  emailAndPassword: createEmailAndPasswordConfig(),
  plugins: authPlugins,
  rateLimit: { enabled: true, storage: rateLimitStorage },
  secret: serverConfig.betterAuthSecret,
  trustedOrigins: serverConfig.betterAuthTrustedOrigins,
}

export const auth: Auth<typeof authOptions> = betterAuth(authOptions)

export type AuthSession = typeof auth.$Infer.Session

function createStripePlugins() {
  const stripeConfig = getStripeConfig()
  if (!stripeConfig) {
    return []
  }

  const stripeClient = new StripeClient(stripeConfig.stripeSecretKey, {
    apiVersion: '2026-08-26.dahlia',
  })

  return [
    stripe({
      stripeClient,
      stripeWebhookSecret: stripeConfig.stripeWebhookSecret,
      createCustomerOnSignUp: false,
      organization: { enabled: true },
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
              automatic_tax: { enabled: true },
              customer_update: { address: 'auto', name: 'auto' },
              tax_id_collection: { enabled: true },
            },
          }
        },
      },
    }),
  ]
}

function getStripeConfig(): StripeRuntimeConfig | null {
  if (!hasText(serverConfig.stripeSecretKey) || !hasText(serverConfig.stripeWebhookSecret)) {
    return null
  }

  const plans = [
    stripePlan(
      'starter',
      serverConfig.stripeStarterPriceId,
      serverConfig.stripeStarterAnnualPriceId,
    ),
    stripePlan('pro', serverConfig.stripeProPriceId, serverConfig.stripeProAnnualPriceId),
    stripePlan(
      'business',
      serverConfig.stripeBusinessPriceId,
      serverConfig.stripeBusinessAnnualPriceId,
    ),
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

function stripePlan(
  planName: Exclude<PlanName, 'free'>,
  priceId?: string,
  annualDiscountPriceId?: string,
): StripePlan | null {
  if (!hasText(priceId) || !hasText(annualDiscountPriceId)) {
    return null
  }

  return { name: planName, priceId, annualDiscountPriceId, limits: planDefinitions[planName] }
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
          matcher(context: BillingHookInput) {
            return context.path !== undefined && subscriptionPaths.has(context.path)
          },
          handler: (context: BillingHookInput) => {
            const parsedContext = parseBillingHookContext(context)
            if (!parsedContext.ok || !isOrganizationBillingRequest(parsedContext.context)) {
              throw new APIError('BAD_REQUEST', {
                message: 'ReviewInbox billing is only available for Organizations.',
              })
            }

            if (!hasSafeBillingRedirectUrls(parsedContext.context)) {
              throw new APIError('BAD_REQUEST', {
                message: 'Billing redirects must stay within ReviewInbox.',
              })
            }
            return Promise.resolve()
          },
        },
      ],
    },
  }
}

function createEmailAndPasswordConfig() {
  if (passwordResetEmailEnabled(serverConfig)) {
    return {
      enabled: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: ({ user, url }: { user: { email: string }; url: string }) => {
        dispatchPasswordResetEmail({ email: user.email, resetLink: url }, serverConfig)
        return Promise.resolve()
      },
    }
  }
  return { enabled: true, revokeSessionsOnPasswordReset: true }
}

function isOrganizationBillingRequest(context: BillingHookContext): boolean {
  const bodyCustomerType = context.body?.customerType
  const queryCustomerType = context.query?.customerType
  if (context.path === '/subscription/list') {
    return queryCustomerType === 'organization' && !hasText(bodyCustomerType)
  }

  return (
    bodyCustomerType === 'organization'
    && (!hasText(queryCustomerType) || queryCustomerType === 'organization')
  )
}

function hasSafeBillingRedirectUrls(context: BillingHookContext): boolean {
  const body = context.body
  return [body?.successUrl, body?.cancelUrl, body?.returnUrl].every((value) =>
    isSafeBillingRedirectUrl(value),
  )
}

function isSafeBillingRedirectUrl(value: string | undefined): boolean {
  if (value === undefined) {
    return true
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
    await database
      .update(organizationTable)
      .set({ planName: 'free' })
      .where(eq(organizationTable.id, subscription.referenceId))
    return
  }

  if (!isPlanName(subscription.plan) || subscription.plan === 'free') {
    await database
      .update(organizationTable)
      .set({ planName: 'free' })
      .where(eq(organizationTable.id, subscription.referenceId))
    return
  }

  await database
    .update(organizationTable)
    .set({ planName: subscription.plan })
    .where(eq(organizationTable.id, subscription.referenceId))
}

const billingBodySchema = z.looseObject({
  customerType: z.string().optional(),
  successUrl: z.string().optional(),
  cancelUrl: z.string().optional(),
  returnUrl: z.string().optional(),
})
const billingQuerySchema = z.looseObject({ customerType: z.string().optional() })

type BillingHookContext = {
  path?: string | undefined
  body?: z.infer<typeof billingBodySchema> | undefined
  query?: z.infer<typeof billingQuerySchema> | undefined
}

type BillingHookInput = { path?: string; body?: unknown; query?: unknown }

function parseBillingHookContext(
  context: BillingHookInput,
): { ok: true; context: BillingHookContext } | { ok: false } {
  // SAFETY: Better Auth exposes hook payloads as any; these schemas validate their runtime shape.
  const bodyResult =
    context.body === undefined
      ? { success: true as const, data: undefined }
      : billingBodySchema.safeParse(context.body)
  // SAFETY: Better Auth exposes hook payloads as any; these schemas validate their runtime shape.
  const queryResult =
    context.query === undefined
      ? { success: true as const, data: undefined }
      : billingQuerySchema.safeParse(context.query)
  if (!bodyResult.success || !queryResult.success) {
    return { ok: false }
  }
  return {
    ok: true,
    context: { path: context.path, body: bodyResult.data, query: queryResult.data },
  }
}

function hasText(value: string | null | undefined): value is string {
  return value !== undefined && value !== null && value !== ''
}

function isPlanName(planName: string): planName is PlanName {
  return (
    planName === 'free' || planName === 'starter' || planName === 'pro' || planName === 'business'
  )
}
