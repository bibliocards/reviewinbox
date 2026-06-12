import { drizzleAdapter } from "@better-auth/drizzle-adapter"
import { deploymentCapabilitiesFor, parseDeploymentModeFromEnvironment } from "@reviewinbox/config"
import { createDatabase, schema } from "@reviewinbox/db"
import { betterAuth } from "better-auth"
import { organization } from "better-auth/plugins"
import { tanstackStartCookies } from "better-auth/tanstack-start"

const db = createDatabase()
const capabilities = deploymentCapabilitiesFor(parseDeploymentModeFromEnvironment(process.env))
const authEnvironment = readAuthEnvironment(process.env)

export const firstUserOnboarding = {
  createsDefaultOrganization: capabilities.firstUserCreatesDefaultOrganization,
  publicSignupInitiallyAllowed: false,
} as const

export const auth = createAuth({ disableSignUp: true })

export const firstOwnerOnboardingAuth = createAuth({ disableSignUp: false })

function createAuth({ disableSignUp }: { disableSignUp: boolean }) {
  return betterAuth({
    baseURL: authEnvironment.baseUrl,
    secret: authEnvironment.secret,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp,
    },
    plugins: [
      organization({
        allowUserToCreateOrganization: false,
      }),
      tanstackStartCookies(),
    ],
  })
}

function readAuthEnvironment(env: NodeJS.ProcessEnv): { baseUrl: string; secret: string } {
  const baseUrl = env.BETTER_AUTH_URL
  const secret = env.BETTER_AUTH_SECRET
  const production = env.NODE_ENV === "production"

  if (!baseUrl) {
    throw new Error("BETTER_AUTH_URL must be configured.")
  }

  if (production && !baseUrl.startsWith("https://")) {
    throw new Error("BETTER_AUTH_URL must use HTTPS in production.")
  }

  if (!secret || secret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must be at least 32 characters.")
  }

  return { baseUrl, secret }
}
