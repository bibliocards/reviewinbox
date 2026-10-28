---
title: Self-hosting ReviewInbox
description: Install, configure, upgrade, and back up ReviewInbox with Docker Compose.
---

Run the web app, API, worker, and Postgres on a VPS with Docker Compose, a domain, and an HTTPS reverse proxy. ReviewInbox is in early alpha: pin a published release and read its release notes before upgrading.

## Install

Use the Compose and environment files corresponding to the release you deploy. The current source files are available here:

```sh
mkdir reviewinbox && cd reviewinbox
curl -fsSLO https://raw.githubusercontent.com/bibliocards/reviewinbox/main/docker-compose.self-hosted.yml
curl -fsSLo .env.self-hosted https://raw.githubusercontent.com/bibliocards/reviewinbox/main/.env.self-hosted.example
openssl rand -base64 32 # BETTER_AUTH_SECRET
openssl rand -base64 32 # APP_ENCRYPTION_KEY
chmod 600 .env.self-hosted
```

Edit `.env.self-hosted` before starting:

| Setting | Value |
| --- | --- |
| `REVIEWINBOX_VERSION` | Exact published release version; avoid `latest` |
| `APP_PUBLIC_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_TRUSTED_ORIGINS` | Your public HTTPS origin, such as `https://reviews.example.com` |
| `BETTER_AUTH_SECRET`, `APP_ENCRYPTION_KEY` | The two generated secrets |
| `POSTGRES_PASSWORD` | Strong database password |

Keep the environment file private. Preserve `APP_ENCRYPTION_KEY` across restarts, upgrades, and restores: stored Store Credentials depend on it.

```sh
docker compose --env-file .env.self-hosted -f docker-compose.self-hosted.yml up -d
docker compose --env-file .env.self-hosted -f docker-compose.self-hosted.yml ps
```

Open the public URL to create the first user and Organization. Later self-hosted signups require an invitation. Configure `MAIL_FROM` and the `SMTP_*` settings to enable invitation and password-reset emails.

## HTTPS routing

With the default loopback ports, route `/api/*` to `127.0.0.1:3000` and other paths to `127.0.0.1:8080`. One public origin keeps API requests and auth cookies together.

For example, a Caddy configuration:

```text
reviews.example.com {
  reverse_proxy /api/* 127.0.0.1:3000
  reverse_proxy 127.0.0.1:8080
}
```

Use equivalent path routing with another HTTPS proxy. Keep database and application ports private.

## Optional AI features

Manual replies and Review sync work without AI. To enable draft generation, set:

```ini
REPLY_DRAFT_WORKER_ENABLED=true
AI_PROVIDER=openai-compatible
AI_MODEL=your-model
AI_API_KEY=your-provider-key
AI_BASE_URL=
```

The supplied Compose file passes `AI_*` settings to the worker for background generation and the API for synchronous regeneration. Set `AI_BASE_URL` only for a custom OpenAI-compatible endpoint. Operators configure providers for the installation; there is no Organization-owned provider configuration.

For [Review analysis](/docs/review-analysis/), also set `TYPESAFE_API_KEY`. Jev classification uses this global key; Luna discovery additionally uses the `AI_*` settings. Missing configuration leaves stored analysis readable. These features are separate from Reply Draft quotas.

## Upgrade

Back up the database, uploads, and environment file first. Set the new release version in `.env.self-hosted`, then:

```sh
docker compose --env-file .env.self-hosted -f docker-compose.self-hosted.yml pull
docker compose --env-file .env.self-hosted -f docker-compose.self-hosted.yml up -d
```

The supplied Compose file runs pending migrations on API startup. Use a single API instance for startup migrations, or move migrations to a dedicated deployment step.

## Back up and restore

Create a database dump:

```sh
docker compose --env-file .env.self-hosted -f docker-compose.self-hosted.yml exec -T postgres pg_dump -U reviewinbox reviewinbox > reviewinbox.sql
```

Adjust the database/user arguments if you changed the defaults. Back up the `uploads` volume and retain the private environment file, including encryption and auth secrets, in secure off-host storage. A database dump alone cannot restore uploaded files or decrypt Store Credentials without the original key.

Restore the database and uploads into a compatible deployment, retain the original secrets, and check the restored installation before directing traffic to it.

## Operations

```sh
docker compose --env-file .env.self-hosted -f docker-compose.self-hosted.yml logs -f api worker web
docker compose --env-file .env.self-hosted -f docker-compose.self-hosted.yml restart worker
docker compose --env-file .env.self-hosted -f docker-compose.self-hosted.yml down
```

`down` stops the stack. Keep the named volumes when preserving installation data.
