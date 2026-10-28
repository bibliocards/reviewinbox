# Contributing

See [Architecture](docs/architecture.md) for package boundaries and product invariants, and [Design](DESIGN.md) before changing the interface.

## Local setup

Install the Node.js version from `mise.toml` with `mise install`. Use the pnpm version pinned by `packageManager` in `package.json`.

```sh
pnpm install
cp .env.example .env
openssl rand -base64 32 # BETTER_AUTH_SECRET
openssl rand -base64 32 # APP_ENCRYPTION_KEY
```

Put the generated values in `.env`. Start Postgres and apply migrations:

```sh
docker compose up -d postgres
pnpm db:migrate
pnpm nx run-many -t serve -p api web
```

Open `http://localhost:4200`. Angular proxies `/api`, including auth, to `http://127.0.0.1:3000`. Keep `BETTER_AUTH_URL` and trusted origins aligned with this setup. Local Postgres uses port 5432 and persists under ignored `volumes/data`.

Start the worker separately for sync and background AI jobs:

```sh
pnpm nx serve worker
```

The environment examples document operator settings. The optional AI features need:

| Capability | Configuration |
| --- | --- |
| Initial/background Reply Drafts | `REPLY_DRAFT_WORKER_ENABLED=true` on the API; `AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY` on the worker |
| Reply Draft regeneration | The same `AI_*` settings on the API |
| Review classification | `TYPESAFE_API_KEY` on the API and worker |
| Topic discovery | Classification enabled plus `AI_*` on the API and worker |
| Invitation and password-reset email | `MAIL_FROM` and SMTP settings on the API |

Use `AI_PROVIDER=openai-compatible` for self-hosted drafting; add `AI_BASE_URL` when using a custom endpoint. Without AI configuration, manual drafting and store sync remain available. See [local billing setup](docs/stripe-local-billing.md) for Cloud subscription testing.

## Checks

Nx owns task orchestration. Prefer `pnpm nx <target> <project>` or `pnpm nx affected -t <target>` for focused checks. Full checks:

```sh
pnpm format
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Oxfmt formats code; Oxlint includes type-aware, SonarJS, and anti-slop rules. Markdown and generated migrations are excluded from formatting. PostgreSQL integration tests use an explicitly supplied `ANALYSIS_TEST_DATABASE_URL`; use an isolated migrated test database.

## Database changes

```sh
pnpm db:generate --name describe_the_change
pnpm db:migrate
```

Use the generation wrapper, which preserves SQL history, appends to the journal, and replaces the single schema snapshot. Commit the new SQL, `meta/_journal.json`, and `meta/snapshot.json` under `packages/db/migrations`. The wrapper manages `--out`, `--config`, and `--prefix`; avoid invoking Drizzle generation directly.

`pnpm db:clear` destroys the local Docker database, including migration history. `pnpm db:reset` clears it and reapplies migrations.

## Assets and releases

The source icon is `apps/site/public/icon.svg`. After editing it, run `pnpm icons:generate` to update the app and site variants.

Self-hosting uses separate API, web, and worker images. Image publishing runs in CI; pin the same semver version for all three. See the [self-hosting guide](apps/site/src/content/docs/docs/self-hosting.md) for startup migrations, upgrades, and backups.
