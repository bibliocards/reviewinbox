# Activation report

Read aggregate activation facts from an explicitly selected database:

```sh
DATABASE_URL='postgres://…' pnpm report:acquisition \
  --from 2026-10-01 --to 2026-11-01 \
  --exclude-org-id internal-org-id
```

The command does not load `.env`. `--from` is inclusive and `--to` exclusive. Repeat `--exclude-org-id` for internal/demo Organizations, or pass comma-separated IDs.

## What the output means

- User registrations are counted separately by creation date.
- Organization stages use the same creation-date cohort and denominator: created, store validated, first import, first saved draft, first publication, and current subscription state.
- Later stages inspect persisted facts before the end of the range. A zero denominator produces a `null` rate.
- Store validation is evidenced by a persisted Store Credential. Rotation preserves its original creation date; deleting it removes that evidence.
- Drafts include AI and manual drafts. A stage does not prove that the first imported Review caused it.
- `billing_active` describes current subscription state when the report runs, not a successful payment or historical billing transition.
- Visits, attribution, and return/retention data are unavailable; the report does not infer them from billing counters.

Reads share a PostgreSQL read-only `REPEATABLE READ` transaction. The report selects aggregate facts rather than credential material, Review/reply content, or User content. Error output omits the connection string, SQL, and excluded IDs.

Implementation and CLI options: [scripts/acquisition-funnel.ts](../scripts/acquisition-funnel.ts).
