# Agent Notes

## Code Review Rules

- Report actionable regressions introduced by this PR. Establish a reachable trigger and concrete user or operational impact; check existing validation, constraints, and callers first.
- Distinguish severity from confidence. A demonstrable edge case is not automatically urgent; consider impact, likelihood, and recovery.
- Prefer the smallest behavior-preserving correction. For low-impact edge cases, accept a documented limitation when fixing it would add disproportionate complexity.
- Report credible security, data-loss, and financial-integrity risks even when uncommon. Leave mechanical checks to CI.
- Respect explicitly accepted risks and settled product decisions; reopen them only with new evidence. An empty review is valid.
- For Organization-scoped changes, prioritize cross-Organization access; for reply publication and Sync Run changes, check incorrect or duplicate external effects from retries. Apply the AI drafting boundary in Domain And Security Constraints below.
- Require compatibility machinery only for an established supported consumer or deployment constraint; otherwise prefer direct replacement.

## Handling Review Feedback

- Before applying review feedback, verify the finding and assess whether the correction is proportionate. Fix confirmed actionable issues; briefly explain invalid reports and disproportionate fixes, distinguishing an already accepted risk from a proposed tradeoff.
- After a fix, verify the reported scenario and affected behavior before resolving its review thread. Keep replies short and preserve unrelated changes.

## Commands

- Package manager is the version pinned in `package.json`; install with `pnpm install`.
- Full checks from `CONTRIBUTING.md`: `pnpm format`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- Nx owns monorepo task orchestration. Prefer `pnpm nx <target> <project>` or `pnpm nx affected -t <target>` once the workspace is initialized.
- Formatting uses Oxfmt; linting uses Oxlint with type-aware, SonarJS, and anti-slop rules.

## Local Runtime

- Copy `.env.example` to `.env`, then generate `APP_ENCRYPTION_KEY` with `openssl rand -base64 32` before work that needs encrypted Store Credentials.
- Local Postgres is `docker compose up -d postgres`; it exposes port `5432` and persists data under ignored `volumes/data`, matching the default `DATABASE_URL` host and port.
- Better Auth requires `BETTER_AUTH_SECRET` generated with `openssl rand -base64 32`; local defaults use `BETTER_AUTH_URL=http://127.0.0.1:3000` and trust the Angular dev server origins for the `/api` proxy.
- Run migrations with `pnpm db:migrate` before using the web app against a fresh database.
- Start the product app stack with `pnpm nx run-many -t serve -p api web`. The Angular dev server runs on `http://localhost:4200` and proxies `/api` paths, including `/api/auth`, to Hono on `http://127.0.0.1:3000`.

## Package Boundaries

- `apps/web` is the Angular product app. It contains client UI only, with no server logic.
- `apps/api` is the Hono HTTP backend. It owns API routes, runtime validation, and Better Auth routes under `/api/auth/*`. Production asset serving is a later slice.
- Shared API contracts use Zod schemas with inferred TypeScript types; validate at the Hono boundary.
- `packages/db` owns Drizzle schema, migrations, and `createDatabase()`.
- `packages/core` is intentionally almost empty in the first executable slice; add domain utilities there when they appear.
- `packages/config` owns deployment-mode parsing and capabilities for `self-hosted` vs `cloud`; prefer capability/service boundaries over scattered cloud checks.

## Generated And Database Files

- Drizzle schema changes require `pnpm db:generate --name <description>`; commit the new SQL, `meta/_journal.json`, and the single `meta/snapshot.json` in `packages/db/migrations`. The wrapper preserves SQL history and replaces the schema snapshot; see `CONTRIBUTING.md` for the workflow.
- `packages/db/drizzle.config.ts` defaults to the local Postgres URL when `DATABASE_URL` is unset.

## UI Direction

- Use `DESIGN.md` as the visual direction source when implementing UI; the intended product UI stack is PrimeNG with Tailwind v4.
- Prefer Tailwind utilities in templates for component styling. Component CSS files are prohibited unless essential styles cannot reasonably be expressed with Tailwind; keep any exception minimal and explain why it is necessary.

## Domain And Security Constraints

- Use `CONTEXT.md` terminology: Organization, Owner, App, Store Connection, Store Credential, Reply Inbox, Review, Reply Draft, Published Reply, Sync Run, Weekly Digest.
- Avoid terms the glossary rejects, especially Workspace, Integration, Token/key for Store Credential, Feedback/message/comment for Review, and Response/answer for Published Reply.
- Store Credentials are encrypted per Store Connection using `APP_ENCRYPTION_KEY`; never log or persist plaintext credential material.
- AI drafting treats reviews, reply context, and model output as untrusted text. Draft generation must not publish replies, mutate workflow state, call store APIs, or read privileged configuration.
