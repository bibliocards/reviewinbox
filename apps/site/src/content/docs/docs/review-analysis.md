---
title: Review analysis
description: Explore recurring topics, reported severity, and trends across imported App Store and Google Play Reviews.
---

Review analysis turns imported App Store and Google Play Reviews into a view of recurring product problems. It is scoped to an App, while its topic catalogue is shared by that App's Store Connections.

## What the analysis does

Jev classifies every imported Review against the App's catalogue and the fixed analysis vocabulary. Jev does not write Reply Drafts or publish replies. A Review can have multiple intents and topics, or none when the text does not support a classification.

The fixed values are stored as stable, language-independent codes and rendered through the product's i18n keys. The initial UI includes English and French translations:

- intents: `report_problem`, `request_feature`, `request_help`, `request_refund`, `express_satisfaction`, and `express_dissatisfaction`;
- severity: `none`, `minor`, `degraded`, `blocking`, `critical`, plus a separate indeterminate state.

Critical means reported data loss or financial harm. A low rating or a refund request alone does not make a Review critical.

Luna is used only for topic discovery. When Jev identifies Reviews that the current catalogue does not cover well, Luna proposes an English label and definition in a bounded batch. A proposal starts as `pending` and needs human approval before it is treated as a validated topic. Luna does not automatically add, reject, merge, or assign a topic.

Topic labels and definitions are in English initially. If catalogue-language settings are added later, they will belong to the Organization; the topic catalogue and its stable identifiers remain scoped to the App.

## Dashboard and filters

The Analysis destination shows severity distribution, leading topics, topic trends, and analysis coverage. Use the filters for App, review period, Store, store-scoped app version, severity, intent, topic, and topic validation status. Chart selections and the supporting Review list share the same filter state, so selecting a segment drills down to the Reviews behind it. Opening a Review returns to its normal Reply Inbox workflow.

The primary period uses the date supplied by the Store. Apple supplies a creation date; Google Play supplies a last-modified date. Versions stay scoped to their Store, and missing versions, unknown severity, and unclassified Reviews remain explicit states.

Pending topics are included in aggregate metrics and remain clickable, but their marks use an outlined or dashed treatment with a visible pending label. Rejected topics are excluded from active analysis and are available only in catalogue administration.

Counts represent unique Reviews in each slice. A Review may belong to several topics, so adding topic counts does not produce a Review total. The dashboard also displays how many Reviews were successfully classified and the corresponding proportion.

## Correcting and managing topics

All Organization members can correct the topics, intents, and severity of an individual Review. A correction is retained across reclassification. When the underlying Review changes, the correction is flagged for rechecking; a member can keep the correction or return that field to automatic classification.

Owners and admins manage an App's topic catalogue. They can approve, reject, rename, reopen, and merge topics. Renaming preserves the topic identifier and its assignments. A merge requires an explicit surviving topic, deduplicates Review assignments, and keeps source labels as aliases to avoid rediscovery. The surviving topic keeps its validation state. Rejection removes active assignments while retaining the history and blocks equivalent future assignments until the topic is reopened.

## History and recovery

Analysis covers all imported history; it does not stop at a 90-day window. Processing is durable and resumable. Each Review has an analysis state such as `pending`, `processing`, `completed`, `failed`, or `skipped`, with the input and criteria fingerprints needed to reject stale results. `completed` means the classification was saved, even when no topic was found. Reviews without usable text can be skipped with a reason.

The initial backfill processes bounded batches and prioritizes fresh Reviews. An interrupted worker can resume pending or failed work without submitting completed Reviews repeatedly. A changed Review or catalogue invalidates only the affected analysis. Reprocessing caused by catalogue maintenance is infrastructure work and does not consume a user-facing credit.

## Configuration and usage

Jev classification and Luna discovery are independent from Managed AI Reply Draft quotas. Classification is included for imported Reviews and the initial history backfill, subject to global cost controls and fair queue scheduling. Luna discovery is metered separately per Organization, runs in bounded daily batches or on a manual request, and reuses cached results when possible. Commercial discovery quotas are intentionally not specified until real usage has been measured.

The installation operator can provide one optional global `TYPESAFE_API_KEY` to the API and worker. Without it, stored analysis remains readable, but new classification and discovery jobs remain unavailable; Review sync and Reply Draft generation continue. Organization owners do not enter this key. Luna reuses the configured generative provider (`AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY`, and, when needed, `AI_BASE_URL`), which the supplied Compose file passes to both services.
