# Application stack

ReviewInbox uses a TypeScript monorepo with pnpm workspaces and Turborepo, TanStack Start for the authenticated product app, Astro for the marketing/docs site, Postgres with Drizzle for persistence, better-auth for identity and organizations, pg-boss for background jobs, and Docker Compose on a VPS for deployment. This favors a self-hostable open source product with simple operations over a platform-managed Next.js/Vercel architecture or a Redis-backed queue.

## Considered Options

- Next.js was rejected for the product app because ReviewInbox will be deployed on a managed VPS and does not need Vercel-specific conventions.
- BullMQ was rejected for V1 because Redis would add an extra required service to the self-hosted setup.
- A single full-stack app without a separate worker was rejected because store sync, AI drafts, and weekly digests need isolated background execution.
