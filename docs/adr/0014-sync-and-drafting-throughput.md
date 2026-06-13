# Sync and drafting throughput

ReviewInbox imports store reviews incrementally and generates reply drafts asynchronously. Store sync jobs must avoid full historical rescans during normal operation, upsert reviews idempotently, and enqueue draft work only for reviews that are new or newly eligible for drafting.

## Decision

- Each store connection keeps sync state such as the last successful cursor, page token, or latest external review timestamp supported by that store API.
- Normal sync uses that state to fetch only changed or recent review pages. Manual backfills may scan deeper history, but they run as explicit jobs with bounded page limits.
- Review writes are idempotent on the external store review identity plus the ReviewInbox ownership columns. Duplicate store pages or retried jobs must not create duplicate draft work.
- Sync jobs batch database writes where practical instead of writing one review at a time.
- Sync jobs do not call AI providers inline. They enqueue draft jobs after review persistence so slow or rate-limited AI calls cannot block store ingestion.
- Draft workers process queued reviews with bounded per-organization and per-provider concurrency. Provider errors or rate limits retry draft jobs without forcing the store sync job to restart.
- Draft workers reuse persisted review metadata, including store locale and app reply language policy, before falling back to model-derived language detection.

## Consequences

This keeps store ingestion predictable when an app has a large review history or when an AI provider is slow. It also makes retries cheaper: sync can safely replay pages, and drafting can retry independently without duplicating reviews or replies.

The tradeoff is slightly more worker and queue bookkeeping. ReviewInbox needs visible sync and draft job states so operators can distinguish store API failures from AI-provider delays.
