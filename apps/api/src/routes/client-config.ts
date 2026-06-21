import { clientConfigResponseSchema } from '@reviewinbox/contracts'
import { getNextAutoSyncWindowStartsAt } from '@reviewinbox/config'
import { user } from '@reviewinbox/db'
import { count } from 'drizzle-orm'
import { Hono } from 'hono'

import { database, serverConfig } from '../db'
import { invitationEmailEnabled } from '../mail'

export const clientConfigRoutes = new Hono()

clientConfigRoutes.get('/api/client-config', async (context) => {
  const [result] = await database.select({ count: count() }).from(user)
  const signUpAvailable = serverConfig.deploymentMode === 'cloud' || (result?.count ?? 0) === 0

  const config = clientConfigResponseSchema.parse({
    deploymentMode: serverConfig.deploymentMode,
    appPublicUrl: serverConfig.appPublicUrl,
    auth: {
      emailPassword: true,
      google: false,
      enterpriseSso: false,
      signUpAvailable,
    },
    mail: {
      invitationEmailEnabled: invitationEmailEnabled(serverConfig),
    },
    autoSync: {
      reviewsEnabled: serverConfig.autoSyncReviewsEnabled,
      nextWindowStartsAt: getNextAutoSyncWindowStartsAt().toISOString(),
      spreadWindowMinutes: serverConfig.autoSyncReviewsSpreadWindowMinutes,
    },
    billing: {
      availablePlans: availableBillingPlans(),
    },
  })

  return context.json(config)
})

function availableBillingPlans(): Array<'starter' | 'pro' | 'business'> {
  return [
    serverConfig.stripeStarterPriceId && serverConfig.stripeStarterAnnualPriceId ? 'starter' : null,
    serverConfig.stripeProPriceId && serverConfig.stripeProAnnualPriceId ? 'pro' : null,
    serverConfig.stripeBusinessPriceId && serverConfig.stripeBusinessAnnualPriceId ? 'business' : null,
  ].filter((plan): plan is 'starter' | 'pro' | 'business' => plan !== null)
}
