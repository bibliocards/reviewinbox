# Architecture

This describes the current implementation. [ADRs](adr/) preserve the reasons behind decisions; records marked superseded are historical. Setup and checks are in [Contributing](../CONTRIBUTING.md).

## Runtime and package boundaries

One codebase supports Cloud and self-hosted deployments, with differences owned by configuration and service boundaries. Production runs separate API, web, worker, and Postgres services. The web image serves Angular; `/api/*` goes to Hono.

| Boundary | Responsibility |
| --- | --- |
| `apps/web` | Angular UI, PrimeNG, Tailwind v4; no server logic |
| `apps/api` | Hono, Better Auth, authorization, Zod validation, publication and synchronous regeneration |
| `apps/worker` | Store sync, Apple version enrichment, AI drafts, classification and topic discovery |
| `apps/site` | Astro marketing site and Starlight user guides |
| `packages/contracts` | Shared Zod schemas and inferred API types |
| `packages/db` | Drizzle schema, migrations and Postgres access |
| `packages/core` | Store Credential encryption |
| `packages/store-adapters`, `packages/sync` | Store APIs and ingestion |
| `packages/ai`, `packages/reply-drafts` | Provider adapters, structured output and drafting orchestration |
| `packages/billing`, `packages/config` | Plans, usage rules and runtime capabilities |
| `packages/queue` | pg-boss jobs backed by Postgres |

## Organization ownership

Reviews belong to an Organization, App, and Store Connection and are unique by Store Connection and external review ID. Reads, writes, joins, and jobs must retain that ownership. See [data ownership](adr/0008-review-data-ownership.md).

Members work through Reviews and correct classifications. Management routes require manager or owner permissions; App creation, Store Credential writes, and Reply Context/language writes require the owner role. Auth uses HTTP-only session cookies.

Self-hosted public signup is available for the first user, with valid invitations required thereafter. Cloud supports public signup. SMTP enables invitation and password-reset emails; password resets revoke existing sessions.

## Store sync

Store Credentials use authenticated encryption per Store Connection with `APP_ENCRYPTION_KEY`; only ciphertext and crypto metadata are persisted. See [credential storage](adr/0006-store-credential-storage.md).

Verification triggers an initial Sync Run. Automatic cadence and manual-sync availability depend on configuration and Cloud plan. New imports consume Cloud quota; Review updates do not. A capped Sync Run is partial.

Apple version enrichment follows version-scoped pages with a persisted cursor. Completed pages and matches commit together. Calls sharing a credential are serialized and rate-limited, with ingestion taking priority; enrichment does not block Review/reply use.

## Reply workflow

[Reply workflow statuses](adr/0009-reply-workflow-statuses.md) and [publishing rules](adr/0014-reply-inbox-and-publishing.md#decision) define the state and concurrency invariants. Publication is an explicit server action; Audit History records actions rather than draft versions. A Review changed after publication returns to the inbox while its previous Published Reply remains visible.

Initial drafting runs through the worker and respects the App's automatic drafting setting. [Reply Context and language policy](adr/0010-auto-drafting-and-reply-context.md) guide the model.

Regeneration is a synchronous API action for an existing draft, independent of automatic drafting. It uses current editor text, optional writing preferences, and Review-specific instructions. It returns a proposal without saving or changing Review state. Accepting copies the proposal into the editor; saving and publication remain explicit.

Content-token checks and row locks reject stale Review edits. Generation rechecks current content and state before accepting a late result. Concurrent publication uses an advisory lock. If the store accepts publication but local recording fails, surface the reconciliation error and avoid blind retries: the external effect may already exist.

## AI drafting boundary

The [AI security decision](adr/0013-ai-drafting-security-boundary.md#decision) is authoritative: the model proposes text without tools or authority over publication, application state, Store Connections, or privileged configuration. Reviews, Reply Context, prior drafts, revision instructions, and model output remain untrusted.

Supply only the current App/Review context. Validate structured output and store reply limits, escape rendered text, and omit full prompts and replies from production logs by default. Providers are deployment-operator configuration; Organization-owned provider settings are not implemented.

## Review analysis

Jev classifies Reviews into fixed intents, reported severity, and App-specific topics. Luna proposes missing English topics for human validation. Analysis is separate from drafting and publication; [the user guide](../apps/site/src/content/docs/docs/review-analysis.md) covers filters and catalogue actions.

Processing covers imported history in bounded, resumable batches. Fingerprints and processing states reject stale results and avoid resubmitting completed Reviews. Catalogue edits do not trigger global reclassification. Manual corrections survive reclassification and are flagged for rechecking when the Review changes.

`TYPESAFE_API_KEY` enables classification; discovery additionally needs the generative provider. Missing configuration leaves stored analysis readable.

## Billing and measurement

Cloud limits attach to the Organization. Internal plans and Usage Events enforce caps; the Better Auth Stripe plugin handles configured Organization subscriptions. Only complete monthly/annual price pairs are offered. Self-hosted deployments do not enforce billing limits.

A successful Cloud draft or regeneration proposal consumes one monthly unit, even if discarded. Failures and manual writing/editing consume none. An Organization advisory lock serializes quota checking and accounting across regeneration and background drafting. Periods use UTC calendar months.

Classification and discovery are separate from Reply Draft quotas. Discovery is bounded and cached; commercial discovery quotas are not implemented. Weekly Digests, overage-pack purchasing, and Organization-owned AI configuration are absent, even where reserved event types or plan metadata exist.

See [local billing setup](stripe-local-billing.md) and the [activation report](acquisition-measurement.md). Billing counters do not establish visits, retention, attribution, or proof of payment.
