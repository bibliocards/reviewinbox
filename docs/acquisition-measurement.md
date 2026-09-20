# Acquisition and activation measurement

ReviewInbox has a small read-only report for the first-party facts already persisted by the application. It is intentionally an operator command: it does not add an analytics SDK, cookies, UTM storage, database writes, migrations, or a production connection by itself.

Run it only when you deliberately choose the database represented by `DATABASE_URL`:

```sh
DATABASE_URL='postgres://…' pnpm exec tsx --tsconfig tsconfig.base.json \
  scripts/acquisition-funnel.ts --from 2026-09-01 --to 2026-10-01
```

`--from` is inclusive and `--to` is exclusive. The range selects the Organization cohort by `organization.created_at` and User registrations by `user.created_at`. All reads run in one PostgreSQL read-only `REPEATABLE READ` transaction, so active writes cannot produce a report that mixes different snapshots across stages. The later stages inspect persisted facts for the included Organizations up to the end of the range. Every Organization stage uses the same cohort denominator; the existing schema does not prove that a manually saved draft or publication came from the first imported Review. The command does not load `.env`, print the connection string, or select Store Credential, Review, Reply Draft, or User content.

Use `--exclude-org-id ID` once per internal Organization, or pass comma-separated non-empty IDs. An option containing only commas or whitespace is rejected. Excluded IDs are used only as filters and are never printed:

```sh
DATABASE_URL='postgres://…' pnpm exec tsx --tsconfig tsconfig.base.json \
  scripts/acquisition-funnel.ts \
  --from 2026-09-01 --to 2026-10-01 \
  --exclude-org-id internal-org-id --exclude-org-id another-internal-org
```

The JSON output contains aggregate counts and rates. Organization counts are distinct Organizations. `user_registered` is the count of distinct `user` rows created in the selected range; Users belonging to an excluded Organization are filtered when that relationship exists, so a User who has not yet created an Organization remains observable. It is a separate volume because an existing User can create a later Organization. Organization rates use `organization_created` as their common denominator, and each numerator is intersected with the included Organization cohort. Every rate includes its numerator, denominator, and denominator stage. A zero denominator produces `value: null`, rather than a misleading zero rate.

The stages use these existing facts:

| Stage | Persisted fact | Interpretation |
| --- | --- | --- |
| `user_registered` | `user.created_at` | Successful User row creation in the selected range. Email verification and later Organization creation are not inferred. |
| `organization_created` | `organization.created_at` | Organization creation in the selected cohort range. |
| `store_validated` | `store_credentials` joined to `store_connections` | A Store Credential is persisted after the server-side store verification path. A connection row alone is not treated as validated. Replacing a Store Credential preserves the original `created_at`, so a rotated credential keeps the historical cohort evidence. If a credential is deleted, its verification evidence is no longer available to this report; stored Reviews remain facts of their own. |
| `first_import` | `reviews.created_at` | At least one Review was actually stored. A successful sync returning zero Reviews does not count. Review text and payloads are never selected. |
| `first_draft` | `reply_drafts.created_at` | At least one Reply Draft was saved, whether generated or manually saved. |
| `first_published` | `published_replies.published_at` | A Published Reply was persisted after the provider publish call succeeded. |
| `returned` | No persisted return/session fact | Reported as `null` with no rate. |
| `billing_active` | `subscription.status` | An included Organization has a current `active` or `trialing` subscription row when the report runs. This is a current subscription state, not proof that a payment succeeded or a historical subscription timeline. |

`store_connections.status` has only the operational values `active` and `disabled`; it is not a `verified` status. A Store Connection with a persisted Store Credential therefore counts as currently evidenced as validated even if it is disabled now. The schema has no explicit verification timestamp, so the report uses the Store Credential row's persistence as the durable evidence available today. The credential replacement path keeps the earliest persistence timestamp when encrypted material is rotated. Deleting the Store Credential makes the validation stage unknown for that connection rather than turning an earlier import into a validation event. This is a deliberate evidence limit: the report cannot recover a deleted validation fact from a later Review or Sync Run.

The report deliberately does not use `usage_events` for funnel stages. Those rows are billing counters, so they must not be reinterpreted as visits, returns, User activity, imports, or traffic. Imports, drafts, and publications are counted from their durable product rows instead.

There is currently no first-party persisted fact for a visitor, campaign/referrer attribution, a qualified visitor, a session return at J7/J30, or a historical billing transition. Consequently this command cannot report visits, provenance, return rate, or acquisition source. Add those only through a separate intentional measurement design that defines consent, retention, internal/demo exclusions, and the cross-domain handoff before changing the schema or UI. Until then, use the report for activation and payment-state observations, and keep visitor and channel conclusions outside its output.

The report's database error output is intentionally generic. Query failures do not print SQL, bound Organization IDs, Store Credential data, or the `DATABASE_URL`; this also protects IDs passed through `--exclude-org-id`. Invalid command-line options are reported by option class without echoing their supplied value.
