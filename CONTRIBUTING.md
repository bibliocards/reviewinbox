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
```

Better Auth is not part of the first executable slice; add its secret and routes in the M1 auth slice.

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

Open `http://localhost:4200`. The Angular dev server proxies `/api` and reserved `/auth` paths to Hono on `http://127.0.0.1:3000`.

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
