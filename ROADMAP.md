# Roadmap

## M0: Repo Foundation

- Initialize pnpm workspaces and Turborepo.
- Create `apps/web` with TanStack Start.
- Create `apps/marketing` with Astro.
- Create `apps/worker` for background jobs.
- Create initial packages: `core`, `db`, `store-adapters`, `ai`, `billing`, and `config`.
- Add Postgres and app services to Docker Compose.
- Add Apache-2.0 license.

## M1: Auth And Multi-App

- Add better-auth.
- Enable organizations.
- Implement first-user self-hosted onboarding.
- Create the default self-hosted organization.
- Add app CRUD.
- Add organization membership and owner/admin permissions.

## M2: Store Connections And Sync

- Add store connections per app.
- Store Apple and Google credentials as encrypted credential blobs.
- Add `APP_ENCRYPTION_KEY` validation.
- Implement Apple App Store review sync.
- Implement Google Play review sync.
- Record sync runs.
- Store normalized reviews with organization, app, and store connection ownership.

## M3: AI Reply Drafts

- Add Vercel AI SDK behind `packages/ai`.
- Support managed AI for cloud deployments.
- Support bring-your-own-key and OpenAI-compatible providers for self-hosted deployments.
- Add app-level reply context as Markdown.
- Add app-level reply language policy with `defaultLanguage` and `mappedLanguages`.
- Generate reply drafts automatically for new reviews by default.
- Store detected review language and chosen reply language.

## M4: Reply Inbox And Publishing

- Build the Review Inbox UI.
- Implement the feedback and accessibility states from `docs/adr/0014-reply-inbox-feedback-and-accessibility.md`.
- List pending, drafted, failed, ignored, and published reviews.
- Edit reply drafts.
- Ignore reviews.
- Publish replies to Apple App Store and Google Play.
- Record published replies.
- Add audit history for draft creation, edits, ignores, failures, and publishing.

## M5: Usage, Limits, And Cloud Readiness

- Add usage events.
- Add organization limits.
- Enforce basic cloud limits for apps, store connections, imported reviews, generated drafts, and members.
- Keep self-hosted deployments billing-free.
- Keep a `packages/billing` boundary for future better-auth Stripe integration.
- Add deployment, backup, and environment configuration docs.

## M6: Weekly Digest

- Generate weekly Markdown digests.
- Identify recurring complaints.
- Identify emerging bugs.
- Identify frequent feature requests.
- Include representative user verbatims.
- Include suggested product actions.
- Add email delivery.

## Later

- Slack and Discord delivery.
- GitHub Issues ingestion.
- CSV import.
- Advanced clustering and trends.
- Better Agent or another agent framework if multi-step agentic workflows become useful.
- Stripe billing through the better-auth Stripe plugin for cloud subscriptions.
