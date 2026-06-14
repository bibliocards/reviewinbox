# Agent Notes

## Commands

- Package manager is `pnpm@11.5.3`; install with `pnpm install`.
- Full checks from `CONTRIBUTING.md`: `pnpm format`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- Focused package commands use pnpm filters, for example `pnpm --filter @reviewinbox/web test`, `pnpm --filter @reviewinbox/core test`, or `pnpm --filter @reviewinbox/db typecheck`.
- Root `pnpm test` is `turbo run test`; Turbo makes tests depend on `^build`, so a focused package test is faster when dependency builds are not needed.
- Formatting is `oxfmt --write "**/*.{js,jsx,ts,tsx}"` with no semicolons; linting is `oxlint .`.

## Local Runtime

- Copy `.env.example` to `.env`, then generate `APP_ENCRYPTION_KEY` and `BETTER_AUTH_SECRET` with `openssl rand -base64 32`.
- Local Postgres is `docker compose up -d postgres`; it exposes port `5432` and persists data under ignored `volumes/data`, matching the default `DATABASE_URL` host and port.
- Run migrations with `pnpm db:migrate` before using the web app against a fresh database.
- Start the product app with `pnpm --filter @reviewinbox/web dev`; first self-hosted setup is at `/onboarding/first-owner`.

## Package Boundaries

- `apps/web` is the TanStack Start product app; routes live under `apps/web/src/routes`.
- `apps/marketing` is Astro and currently independent from the product app.
- `apps/worker` is the Node service boundary for sync, AI drafts, and digests; do not fold background jobs into the web app.
- `packages/db` owns Drizzle schema, migrations, and `createDatabase()`.
- `packages/core` owns domain utilities such as `StoreCredentialVault`; `packages/store-adapters` depends on core for store-specific integrations.
- `packages/ai` is the only boundary that should wrap Vercel AI SDK usage; do not expose generic agent/tool authority from it.
- `packages/config` owns deployment-mode parsing and capabilities for `self-hosted` vs `cloud`; prefer capability/service boundaries over scattered cloud checks.

## Generated And Database Files

- `apps/web/src/routeTree.gen.ts` is TanStack Router generated output; do not edit it by hand. If it changes during checks, run `pnpm format` before committing.
- Drizzle schema changes require `pnpm db:generate`; commit the generated migration in `packages/db/migrations` with the schema change.
- `packages/db/drizzle.config.ts` defaults to the local Postgres URL when `DATABASE_URL` is unset.

## UI Direction

- Use `DESIGN.md` as the visual direction source when implementing UI; the intended component stack is Base UI primitives with shadcn/ui-style composition.

## Domain And Security Constraints

- Use `CONTEXT.md` terminology: Organization, Owner, App, Store Connection, Store Credential, Reply Inbox, Review, Reply Draft, Published Reply, Sync Run, Weekly Digest.
- Avoid terms the glossary rejects, especially Workspace, Integration, Token/key for Store Credential, Feedback/message/comment for Review, and Response/answer for Published Reply.
- Store Credentials are encrypted per Store Connection using `APP_ENCRYPTION_KEY`; never log or persist plaintext credential material.
- AI drafting treats reviews, reply context, and model output as untrusted text. Draft generation must not publish replies, mutate workflow state, call store APIs, or read privileged configuration.
