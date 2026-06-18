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
BETTER_AUTH_URL=http://localhost:5173
```

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

Open `http://localhost:5173` and create the first Owner from `/onboarding/first-owner`.

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

## Database

Generate migrations after schema changes:

```bash
pnpm db:generate
```

Migrations live in `packages/db/migrations` and should be committed with schema changes.
