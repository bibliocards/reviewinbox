# Contributing

## Local Setup

Install dependencies:

```bash
pnpm install
```

Create a local environment file:

```bash
cp .env.example .env
```

Set local secrets in `.env`:

```bash
APP_ENCRYPTION_KEY=$(openssl rand -base64 32)
BETTER_AUTH_SECRET=$(openssl rand -base64 32)
```

Keep `BETTER_AUTH_URL` aligned with the Hono API origin. For local development it defaults to `http://127.0.0.1:3000`, while `BETTER_AUTH_TRUSTED_ORIGINS` includes the Angular dev server origins used by the `/api` proxy.

Start Postgres:

```bash
docker compose up -d postgres
```

Apply database migrations:

```bash
pnpm db:migrate
```

Start the product app stack:

```bash
pnpm nx run-many -t serve -p api web
```

Open `http://localhost:4200`. The Angular dev server proxies `/api` paths, including `/api/auth`, to Hono on `http://127.0.0.1:3000`.

## Checks

Before committing, run:

```bash
pnpm format
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Nx owns task orchestration for the monorepo. Prefer `pnpm nx affected -t <target>` for focused checks once the workspace is initialized.
Biome owns formatting and linting for the repo. Do not add separate oxfmt or oxlint configuration.

## Database

Generate migrations after schema changes:

```bash
pnpm db:generate
```

Migrations live in `packages/db/migrations` and should be committed with schema changes.
