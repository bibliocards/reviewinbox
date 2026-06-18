# Agent Notes

## Commands

- Package manager is `pnpm@11.5.3`; install with `pnpm install`.
- Full checks from `CONTRIBUTING.md`: `pnpm format`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- Nx owns monorepo task orchestration. Prefer `pnpm nx <target> <project>` or `pnpm nx affected -t <target>` once the workspace is initialized.
- Formatting is `oxfmt --write "**/*.{js,jsx,ts,tsx}"` with no semicolons; linting is `oxlint .`.

## Local Runtime

- Copy `.env.example` to `.env`, then generate `APP_ENCRYPTION_KEY` and `BETTER_AUTH_SECRET` with `openssl rand -base64 32`.
- Local Postgres is `docker compose up -d postgres`; it exposes port `5432` and persists data under ignored `volumes/data`, matching the default `DATABASE_URL` host and port.
- Run migrations with `pnpm db:migrate` before using the web app against a fresh database.
- Start the product app stack with `pnpm nx run-many -t serve -p api web`; first self-hosted setup is at `/onboarding/first-owner`.

## Package Boundaries

- `apps/web` is the Angular product app. It contains client UI only, with no server logic.
- `apps/api` is the Hono HTTP backend. It owns API routes, Better Auth routes, HTTP-only sessions, runtime validation, and serving the built Angular assets in production.
- `apps/marketing` is Astro and currently independent from the product app.
- `apps/worker` is the Node service boundary for sync, AI drafts, and digests; do not fold background jobs into the web app.
- Shared API contracts use Zod schemas with inferred TypeScript types; validate at the Hono boundary.
- `packages/db` owns Drizzle schema, migrations, and `createDatabase()`.
- `packages/core` owns domain utilities such as `StoreCredentialVault`; `packages/store-adapters` depends on core for store-specific integrations.
- `packages/ai` is the only boundary that should wrap Vercel AI SDK usage; do not expose generic agent/tool authority from it.
- `packages/config` owns deployment-mode parsing and capabilities for `self-hosted` vs `cloud`; prefer capability/service boundaries over scattered cloud checks.

## Generated And Database Files

- Drizzle schema changes require `pnpm db:generate`; commit the generated migration in `packages/db/migrations` with the schema change.
- `packages/db/drizzle.config.ts` defaults to the local Postgres URL when `DATABASE_URL` is unset.

## UI Direction

- Use `DESIGN.md` as the visual direction source when implementing UI; the intended product UI stack is PrimeNG with Tailwind v4.

## Domain And Security Constraints

- Use `CONTEXT.md` terminology: Organization, Owner, App, Store Connection, Store Credential, Reply Inbox, Review, Reply Draft, Published Reply, Sync Run, Weekly Digest.
- Avoid terms the glossary rejects, especially Workspace, Integration, Token/key for Store Credential, Feedback/message/comment for Review, and Response/answer for Published Reply.
- Store Credentials are encrypted per Store Connection using `APP_ENCRYPTION_KEY`; never log or persist plaintext credential material.
- AI drafting treats reviews, reply context, and model output as untrusted text. Draft generation must not publish replies, mutate workflow state, call store APIs, or read privileged configuration.
