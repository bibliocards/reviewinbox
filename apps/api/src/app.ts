import { healthResponseSchema } from "@reviewinbox/contracts"
import { Hono } from "hono"

export function createApp() {
  const app = new Hono()

  app.get("/api/health", (context) => {
    const health = healthResponseSchema.parse({
      ok: true,
      service: "api",
      checkedAt: new Date().toISOString(),
    })

    return context.json(health)
  })

  return app
}

export type ApiApp = ReturnType<typeof createApp>
