import { healthResponseSchema } from "@reviewinbox/contracts"
import { Hono } from "hono"

import { auth } from "./auth"

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

  app.on(["GET", "POST"], "/auth/*", (context) => auth.handler(context.req.raw))

  return app
}

export type ApiApp = ReturnType<typeof createApp>
