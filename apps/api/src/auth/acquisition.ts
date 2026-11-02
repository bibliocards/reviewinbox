import { acquisitionSchema } from '@reviewinbox/contracts'
import type { BetterAuthOptions } from 'better-auth'
import { z } from 'zod'

const signUpAcquisitionSchema = z.object({ acquisitionAtSignUp: acquisitionSchema })

export function acquisitionAuthOptions(
  deploymentMode: 'cloud' | 'self-hosted',
): Pick<BetterAuthOptions, 'user' | 'databaseHooks'> {
  return {
    user: {
      additionalFields: {
        acquisition: { type: 'json', required: false, input: false, returned: false },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before(newUser, context) {
            const body = signUpAcquisitionSchema.safeParse(context?.body)
            const acquisition =
              deploymentMode === 'cloud' && context?.path === '/sign-up/email' && body.success
                ? body.data.acquisitionAtSignUp
                : null
            return Promise.resolve({ data: { ...newUser, acquisition } })
          },
        },
      },
    },
  }
}
