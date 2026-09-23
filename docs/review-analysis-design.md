# Review analysis design

Status: design confirmed and implementation authorized. Agreed requirements are recorded below; implementation and validation recommendations remain identified as such.

## Agreed requirements

- Support both daily review triage and discovery of recurring product problems.
- Add a dedicated sidebar destination with an interactive analysis dashboard, including period, version, and reported-severity exploration.
- Each app owns an evolving topic catalogue shared across its store connections.
- AI topic proposals require human validation. Pending topics can be assigned provisionally with lower prominence; approved topics are validated; rejected topics cannot be assigned.
- Review intents use a predefined, multi-label vocabulary. Reported severity uses a common ordered scale.
- Classification supports tags and filters. No automatic publishing, ignoring, or other reply-workflow transitions are authorized.
- Use the official TypeSafe SDK with an optional TypeSafe API key. Actions depending on that key must be optional too.
- Use one global installation key, including for Cloud. Organization-level Bring Your Own Key is deferred; plan-specific quotas remain under discussion.
- Include pending topics in the main charts, clearly distinguished visually while remaining interactive.
- Discover topics automatically in daily batches and on manual request, using reviews Jev identifies as insufficiently covered by the catalogue.
- Analyze all imported historical reviews without a 90-day cutoff. Track processing durably so completed work is not repeatedly submitted.
- Use explicit `pending | approved | rejected` topic validation states.
- Match the existing product UI and prioritize consistent, accessible interactions.
- Include Jev classification for all imported reviews and the complete initial backfill, independently of reply-draft quotas. Launch Luna discovery with bounded batches, limited frequency and usage monitoring; commercial plan-specific discovery quotas are deferred.
- Rejecting a topic removes its existing assignments from active analysis and prevents further assignment or equivalent AI proposals. Retain the rejection history and allow manual reopening.
- Support topic renaming and merging in the first version. Renaming preserves topic identity and assignments; merging consolidates assignments without counting a review twice.
- Deliver documentation and marketing-site updates alongside the feature, explaining Jev classification and the resulting analysis capabilities.
- Use stable language-independent codes for fixed intents, severity levels and statuses, rendered through i18n keys. Ship translations for the product's existing English and French locales and permit future locales without changing stored classifications.
- Approved intent vocabulary: report a problem, request a feature, request help, request a refund, express satisfaction, express dissatisfaction. Intents are multi-label and can be absent.
- Approved severity scale: no problem described, minor, degraded, blocking, critical; indeterminate remains a separate state. Critical means reported data loss or financial harm, not merely a low rating or refund request.
- Make severity visually scannable through semantic colors and complementary icons/labels in both themes.
- Allow human correction of topics, intents and severity. Preserve overrides during reclassification, flag them for rechecking when the underlying review changes, and allow returning to automatic classification.
- Generate topic labels and definitions in English initially. Future catalogue-language configuration belongs to the Organization, not the App; the topic catalogue itself remains app-scoped. This does not restrict the existing translated UI.
- All organization members can read analysis and correct individual reviews; owner/admin manage the app catalogue. The global provider secret remains installation-operator configuration.
- Use the store-provided review date for the primary dashboard period, documenting the Apple creation-date versus Google last-modified-date difference. A version filter requires an App and, without a Store, matches the same version label across both of that App's stores.

## Documentation and marketing delivery

Update product documentation for the analysis dashboard, filters, topic validation/rejection/merge, pending-topic chart styling, history processing, and applicable quota policy. Update self-hosting/configuration documentation and environment examples for the optional global TypeSafe key, missing-key behavior, and separate generative-provider requirements for topic discovery. Document durable processing states and recovery in appropriate operator/developer material.

Update the existing marketing site to explain product outcomes: recurring topics, reported severity, interactive trends and version filters, and drill-down to reviews. Explain Jev's classification role and Luna's topic-proposal role where relevant without suggesting Jev writes replies or guarantees correctness. Align plan descriptions with the implemented entitlement policy; do not invent numerical discovery quotas. Use actual feature screenshots after implementation, consistent with the product's UI. Coordinate public availability claims with real feature delivery.

## Proposed experience

An Analysis destination contains an overview, a filtered review list, and the selected app's topic catalogue. Proposed filters: app, review period, store, app version, severity, intent, topic, and topic validation status.

Show severity distribution, leading topics, topic trends, and analysis coverage. Clicking a chart segment filters the supporting reviews; opening a review leads to its reply workflow. Make filters shareable through the URL.

Pending topics contribute to default aggregate metrics and main charts. Proposed visual treatment: outlined or hatched chart marks, dashed trend lines, and an explicit pending label in legends/tooltips. Keep text contrast and click/keyboard interactions intact; provisional does not mean disabled. Rejected topics appear in a separate catalogue tab and can be reopened.

Reuse existing product components, theme tokens, spacing and filter patterns in both supported themes. Chart and table selections share the same filter state; provide visible active filters, clear/reset actions, loading/empty/error states, and a predictable return from the reply inbox.

Recommended placement following existing product boundaries: app-level topic catalogue management is accessible from the App's settings and from Analysis through the same editor. Review-specific corrections belong next to the selected review in Analysis and the Reply Inbox, through one shared editor. Organization settings do not own an app's catalogue. The installation-wide TypeSafe secret remains operator configuration, never exposed to tenant owners.

Fixed values use stable codes such as `request_refund` and `blocking`, with presentation keys such as `analysis.intents.request_refund` and `analysis.severity.blocking`. Dynamic app topics use stable IDs and stored editable English labels/definitions rather than runtime additions to translation files. Future generated-topic language selection will be organization-scoped.

Agreed roles: all organization members can read analysis and correct a review, consistent with existing reply-inbox permissions; owner/admin can manage the app catalogue, consistent with app editing. Permission enforcement belongs on the API as well as the UI.

Metrics count unique reviews within each slice. A review can belong to multiple topics, so topic counts must not be summed into a review total. Display the number and proportion of reviews successfully classified. Missing version, unknown severity, and unclassified reviews remain explicit states, not zero severity. Version labels are attributed to their source Store; the filter compares the label across one App's stores when no Store is selected. Version options are scoped to the App and optional Store, not to the current Review period or other filters.

## Proposed processing

1. Persist a new or changed review through the existing sync flow.
2. If classification is configured, enqueue an independent PgBoss job.
3. Jev evaluates known topics, fixed intents, severity, and whether the catalogue adequately covers the review.
4. Luna proposes English labels and definitions for missing topics from eligible reviews in daily batches or on manual request. Reuse the configured generative-provider boundary; keep discovery metering separate from reply drafting under the agreed launch policy.
5. Deduplicate proposals against the catalogue, including rejected topics; store new proposals as pending.
6. Persist classification results with provider/model, criteria version, input fingerprint, and processing status. Reject stale job results when the Review changes. Catalogue edits do not trigger a global reclassification.

Jev can select supplied candidates or detect that none fits. It does not generate arbitrary new topic labels. Creating candidates from extracted phrases is possible but would require a separate candidate-generation mechanism.

## Proposed implementation boundaries

- `packages/ai`: TypeSafe SDK adapter and classification criteria; separate generative topic proposal capability.
- `packages/queue` and `apps/worker`: jobs, retry policy, concurrency and feature availability checks.
- `packages/db`: topic catalogue, review-topic associations, classifications and manual overrides with organization/app ownership.
- `packages/contracts` and `apps/api`: validated filters, catalogue actions, analysis queries and drill-down.
- `apps/web`: analysis destination and classification badges/filters in the reply inbox.
- `packages/config`: optional global TypeSafe configuration; organization-owned credentials are deferred.

Prefer explicit `pending | approved | rejected` states over nullable booleans. A topic's validation state is independent of the confidence and correctness of its assignment to a particular review. Preserve manual corrections during automated reclassification.

Without the key, propose stopping new classification and dependent discovery jobs while keeping stored results readable. Missing configuration should not create retry storms or block sync and drafting. Backfill covers all imported history, in bounded batches with fresh reviews prioritized.

## Proposed processing marker

Add a durable per-review `analysisStatus` with `pending | processing | completed | failed | skipped`, plus a completion timestamp and input/criteria fingerprints in the analysis record. `completed` means the classification was persisted, not that a topic was found or approved. A review without usable text can be skipped with a reason. Changed input invalidates prior completion for the new revision; stale job results must not overwrite newer analysis. Recovery of interrupted jobs must prevent `processing` from becoming permanent.

## Agreed launch quota policy

Repository inspection confirms there is no organization-owned AI credential configuration yet; Bring Your Own Key appears as plan metadata. Current monthly Cloud limits in `packages/billing/src/plans.ts` are 30 imported reviews and 5 managed reply drafts for Free, and 5,000 imported reviews and 1,000 managed reply drafts for Pro. No classification or discovery usage events exist yet.

Keep Jev classification and Luna topic discovery separate from reply-draft quotas. Classification is included for all imported reviews and the complete initial backfill, subject to global cost controls and fair queue scheduling. Meter discovery separately at organization level, with bounded batches and limited frequency; reuse batches and cache results for repeated manual requests. Infrastructure retries do not consume user-facing credits. Commercial plan-specific discovery quotas will be decided after measuring usage.

## Agreed topic lifecycle

Renaming preserves the topic identifier and review associations. Merging consolidates associations into a surviving topic without duplicate review counts. Rejection removes existing associations from active charts and filters while retaining an audit trace; it blocks future assignment and equivalent proposals until manually reopened. Affected reviews remain eligible for other topics. Exact label/alias matches can be blocked deterministically; semantic equivalence detection must account for imperfect model judgments and retain human control.

Agreed merge behavior: explicitly select the surviving topic and retain its validation status; preserve source labels as aliases to prevent duplicate rediscovery. Require a separate reopening action before merging into a rejected topic.

## Recommended validation before delivery

- Verify organization isolation and role enforcement for all analysis/catalogue operations.
- Cover durable processing, interrupted-job recovery, stale-result rejection, changed reviews, missing credentials and idempotent metering.
- Cover rejection, merge deduplication, aliases and preservation of human corrections.
- Verify dashboard drill-down counts, pending-topic inclusion, store dates/versions and untranslated-key absence in both locales.
- Inspect the interface in both themes and narrow layouts, including keyboard access and redundant severity/status indicators.
- Evaluate model quality on a labeled sample spanning supported review languages, mixed topics, ambiguous reviews, requests for refunds without financial harm, and out-of-catalogue subjects. Report intent/topic precision and recall and severity confusion separately from deterministic tests; calibrate thresholds using evidence rather than presenting unmeasured model accuracy as established.
- Validate documentation and marketing against implemented behavior and actual feature screenshots.

## Final confirmation

The user confirmed the recorded scope and requested implementation. Commercial discovery quotas and organization-level BYOK/language configuration are explicitly deferred, not prerequisites for this release.

## References

- TypeSafe introduction: https://docs.typesafe.ai/introduction
- TypeSafe direct API: https://docs.typesafe.ai/introduction/quickstart
- TypeSafe JavaScript/TypeScript SDK: https://docs.typesafe.ai/sdk/javascript
- Jev capabilities: https://typesafe.ai/blog/introducing-system-one-models-and-jev
