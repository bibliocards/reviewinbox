# Agent Notes

## Commands

- Package manager is `pnpm@11.5.3`; install with `pnpm install`.
- Full checks from `CONTRIBUTING.md`: `pnpm format`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- Nx owns monorepo task orchestration. Prefer `pnpm nx <target> <project>` or `pnpm nx affected -t <target>` once the workspace is initialized.
- Formatting and linting use Biome. Do not add oxfmt or oxlint configuration.

## Local Runtime

- Copy `.env.example` to `.env`, then generate `APP_ENCRYPTION_KEY` with `openssl rand -base64 32` before work that needs encrypted Store Credentials.
- Local Postgres is `docker compose up -d postgres`; it exposes port `5432` and persists data under ignored `volumes/data`, matching the default `DATABASE_URL` host and port.
- Better Auth requires `BETTER_AUTH_SECRET` generated with `openssl rand -base64 32`; local defaults use `BETTER_AUTH_URL=http://127.0.0.1:3000` and trust the Angular dev server origins for the `/auth` proxy.
- Run migrations with `pnpm db:migrate` before using the web app against a fresh database.
- Start the product app stack with `pnpm nx run-many -t serve -p api web`. The Angular dev server runs on `http://localhost:4200` and proxies `/api` and reserved `/auth` paths to Hono on `http://127.0.0.1:3000`.

## Package Boundaries

- `apps/web` is the Angular product app. It contains client UI only, with no server logic.
- `apps/api` is the Hono HTTP backend. It owns API routes, runtime validation, and Better Auth routes under `/auth/*`. Production asset serving is a later slice.
- Shared API contracts use Zod schemas with inferred TypeScript types; validate at the Hono boundary.
- `packages/db` owns Drizzle schema, migrations, and `createDatabase()`.
- `packages/core` is intentionally almost empty in the first executable slice; add domain utilities there when they appear.
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
