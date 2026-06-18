import { z } from "zod"

export const deploymentModeSchema = z.enum(["self-hosted", "cloud"])

export type DeploymentMode = z.infer<typeof deploymentModeSchema>

export const serverConfigSchema = z.object({
  deploymentMode: deploymentModeSchema.default("self-hosted"),
  databaseUrl: z.url().default("postgres://reviewinbox:reviewinbox@localhost:5432/reviewinbox"),
  apiHost: z.string().default("127.0.0.1"),
  apiPort: z.coerce.number().int().min(1).max(65535).default(3000),
})

export type ServerConfig = z.infer<typeof serverConfigSchema>

export function loadServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return serverConfigSchema.parse({
    deploymentMode: env["DEPLOYMENT_MODE"],
    databaseUrl: env["DATABASE_URL"],
    apiHost: env["API_HOST"],
    apiPort: env["API_PORT"],
  })
}
