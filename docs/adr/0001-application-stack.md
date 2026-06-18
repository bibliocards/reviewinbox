# Application stack

ReviewInbox uses a TypeScript monorepo with pnpm and Nx, Angular for the authenticated product app, Hono as the only backend HTTP boundary, Astro for the marketing/docs site, Postgres with Drizzle for persistence, better-auth for identity and organizations, ngx-better-auth for the Angular auth client, Zod for shared API contracts, pg-boss for background jobs, and Docker Compose for self-hosted deployment.

The Hono service owns API routes, Better Auth routes, HTTP-only session cookies, runtime validation, and serving the built Angular assets in production. Angular contains no server logic and does not store auth secrets. The worker remains a separate Node service for store sync, AI reply drafts, and weekly digests. Self-hosted Docker deployments run at least Postgres, the public Hono service, and the worker; the Hono and worker services may be built from the same image with different commands.

This favors a self-hostable open source product that an independent developer can deploy with Docker while keeping browser, HTTP API, and background execution boundaries explicit.

## Considered Options

- TanStack Start with React was rejected for the product app because the chosen stack is Angular with an explicit Hono API boundary.
- Turborepo was rejected because Nx provides the monorepo graph, cache, and affected task orchestration; keeping both would create duplicate orchestration.
- shadcn/ui was rejected because PrimeNG with Tailwind v4 will provide the product UI component stack while preserving the visual direction in `DESIGN.md`.
- Angular server logic or SSR was rejected for V1 because Hono is the only backend HTTP boundary and should serve the built Angular assets in production.
- OpenAPI as the primary contract source was rejected for V1 because shared Zod schemas provide both runtime validation and TypeScript inference with less generation overhead.
- BullMQ was rejected for V1 because Redis would add an extra required service to the self-hosted setup.
- A single full-stack app without a separate worker was rejected because store sync, AI drafts, and weekly digests need isolated background execution.
