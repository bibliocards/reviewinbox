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
- `registrationsBySource` groups the registered Users in the selected period by source, medium and campaign. Each User counts once; excluded internal Organization members are excluded here too.
- Existing registrations and registrations without valid provenance are `unknown`, not inferred as `direct`. Visits and return/retention data remain unavailable; the report does not infer them from billing counters.

Reads share a PostgreSQL read-only `REPEATABLE READ` transaction. The report selects aggregate facts rather than credential material, Review/reply content, or User content. Error output omits the connection string, SQL, and excluded IDs.

Implementation and CLI options: [scripts/acquisition-funnel.ts](../scripts/acquisition-funnel.ts).

## Registration attribution

Cloud registrations can store optional provenance on the User at account creation. It is not copied to Organization membership or used for authorization, pricing or billing.

The marketing site retains the first visit in the current tab's `sessionStorage`. It reads valid `utm_source`, `utm_medium` and optional `utm_campaign` labels, or estimates provenance from the referrer hostname: Google/Bing search, ChatGPT/Perplexity/Claude, GitHub, another referring host, or direct when none is available. Google AI and ordinary Google Search cannot be distinguished from this referrer alone.

The site forwards this provenance to Cloud sign-up/login links through `ri_source`, `ri_medium`, optional `ri_campaign`, and `ri_landing`, preserving plan parameters. The same code runs on the public guides. Cloud captures it before router navigation, then sends `acquisitionAtSignUp` with the existing registration request. A direct GitHub → Cloud link is classified by the referrer when available; UTM labels can make links explicit. Example:

```text
https://reviewinbox.app/?utm_source=github&utm_medium=referral&utm_campaign=readme
```

The stored data is limited to source/medium/campaign labels (80 characters each) and a public marketing landing path (`/`, `/pricing/`, `/docs/…`, `/guides/…`, up to 200 characters). Full referrer URLs, arbitrary query parameters, private app routes and fragments are not retained. This attribution adds no third-party analytics request, visitor record, cookie or persistent localStorage identifier.

The API validates the shared contract at account creation. Invalid/missing optional attribution does not prevent registration. Self-hosted registrations store no provenance. The field is hidden from auth responses and cannot be rewritten through profile updates. Browser storage is cleared after successful registration; storage denial still permits the current visit's attribution and account creation.

Limitations: this is first-touch attribution within one tab session, not cross-device or multi-touch attribution. Referrer restrictions, JavaScript blocking and direct visits can hide the actual source. Client-provided labels are indicative and can be forged. The report measures registrations by source; it does not yet attribute Organization activation or paid conversions to that source, and provides no visit-to-signup denominator.

Apply migration `0011_signup_acquisition` before deploying the API/web changes. No historical attribution is backfilled. The production database was not migrated as part of implementation.
