import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { organization } from "better-auth/plugins/organization"
import { loadServerConfig } from "@reviewinbox/config"
import { createDatabase, databaseSchema } from "@reviewinbox/db"

const config = loadServerConfig()
const database = createDatabase(config.databaseUrl)
const rateLimitStorage = process.env["NODE_ENV"] === "test" ? "memory" : "database"

export const auth = betterAuth({
  appName: "ReviewInbox",
  basePath: "/auth",
  baseURL: config.betterAuthUrl,
  database: drizzleAdapter(database, {
    provider: "pg",
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
  secret: config.betterAuthSecret,
  trustedOrigins: config.betterAuthTrustedOrigins,
})

export type AuthSession = typeof auth.$Infer.Session
