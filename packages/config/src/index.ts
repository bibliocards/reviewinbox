import { z } from "zod"

export const deploymentModeSchema = z.enum(["self-hosted", "cloud"])

export type DeploymentMode = z.infer<typeof deploymentModeSchema>

const localOrigins = new Set(["http://localhost", "http://127.0.0.1"])

function isLocalHttpOrigin(origin: string) {
  const url = new URL(origin)
  return url.protocol === "http:" && localOrigins.has(`${url.protocol}//${url.hostname}`)
}

function parseOrigin(origin: string) {
  const url = new URL(origin)

  if (url.origin !== origin) {
    throw new Error(`Trusted origin must not include a path: ${origin}`)
  }

  if (url.protocol !== "https:" && !isLocalHttpOrigin(origin)) {
    throw new Error(`Trusted origin must use HTTPS unless it is local: ${origin}`)
  }

  return origin
}

export const serverConfigSchema = z
  .object({
    deploymentMode: deploymentModeSchema.default("self-hosted"),
    databaseUrl: z.url().default("postgres://reviewinbox:reviewinbox@localhost:5432/reviewinbox"),
    apiHost: z.string().default("127.0.0.1"),
    apiPort: z.coerce.number().int().min(1).max(65535).default(3000),
    betterAuthSecret: z.string().min(32).optional(),
    betterAuthUrl: z.url().default("http://127.0.0.1:3000"),
    betterAuthTrustedOrigins: z
      .string()
      .default("http://localhost:4200,http://127.0.0.1:4200")
      .transform((value) =>
        value
          .split(",")
          .map((origin) => origin.trim())
          .filter((origin) => origin.length > 0)
          .map(parseOrigin),
      ),
  })
  .superRefine((config, context) => {
    if (config.deploymentMode !== "cloud") {
      return
    }

    if (new URL(config.betterAuthUrl).protocol !== "https:") {
      context.addIssue({
        code: "custom",
        path: ["betterAuthUrl"],
        message: "Cloud deployments must set BETTER_AUTH_URL to an HTTPS origin.",
      })
    }

    for (const origin of config.betterAuthTrustedOrigins) {
      if (new URL(origin).protocol !== "https:") {
        context.addIssue({
          code: "custom",
          path: ["betterAuthTrustedOrigins"],
          message: "Cloud deployments must only trust HTTPS origins.",
        })
      }
    }
  })

export type ServerConfig = z.infer<typeof serverConfigSchema>

export function loadServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return serverConfigSchema.parse({
    deploymentMode: env["DEPLOYMENT_MODE"],
    databaseUrl: env["DATABASE_URL"],
    apiHost: env["API_HOST"],
    apiPort: env["API_PORT"],
    betterAuthSecret: env["BETTER_AUTH_SECRET"],
    betterAuthUrl: env["BETTER_AUTH_URL"],
    betterAuthTrustedOrigins: env["BETTER_AUTH_TRUSTED_ORIGINS"],
  })
}
