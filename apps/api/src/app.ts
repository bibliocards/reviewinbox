import { healthResponseSchema } from "@reviewinbox/contracts"
import { Hono } from "hono"
import { bodyLimit } from "hono/body-limit"

import { auth } from "./auth"
import { appsRoutes } from "./routes/apps"
import { storeConnectionsRoutes } from "./routes/store-connections"

export function createApp() {
  const app = new Hono()

  app.use(
    "/api/*",
    bodyLimit({
      maxSize: 128 * 1024,
      onError: (context) => context.json({ error: "Request body too large." }, 413),
    }),
  )

  app.get("/api/health", (context) => {
    const health = healthResponseSchema.parse({
      ok: true,
      service: "api",
      checkedAt: new Date().toISOString(),
    })

    return context.json(health)
  })

  app.on(["GET", "POST"], "/auth/*", (context) => auth.handler(context.req.raw))
  app.route("/", appsRoutes)
  app.route("/", storeConnectionsRoutes)

  return app
}

export type ApiApp = ReturnType<typeof createApp>
