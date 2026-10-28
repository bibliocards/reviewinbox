---
title: Review analysis
description: Explore recurring topics and reported severity, then correct classifications and manage topics.
---

Open **Analysis** to explore imported Reviews by App, period, Store, version, severity, intent, and topic. Select a chart segment to inspect the Reviews behind it; open a Review to return to its Reply Inbox workflow.

## Understand the results

Jev classifies Reviews into shared intents, reported severity, and topics from the App's catalogue. A Review can have several intents/topics or none. Luna proposes missing English topic labels and definitions for human approval; neither model publishes replies.

- Severity describes reported impact, not star rating or a verified incident. Critical means reported data loss or financial harm; a refund request alone is not critical.
- Unknown severity and unclassified Reviews are distinct from no problem.
- Pending topics appear provisionally with a visible label; rejected topics are excluded from active analysis.
- Counts represent unique Reviews in each slice. Topic counts overlap and cannot be added into a Review total.

The period uses the Store's Review date. Version filtering requires an App and matches the label across both stores unless a Store is selected. Missing versions stay visible as an explicit state.

## Correct a classification

All Organization members can correct a Review's intents, severity, and topics, or return it to automatic classification. Corrections survive reclassification. When the Review changes, the correction is flagged for rechecking.

## Manage the topic catalogue

Owners and admins can approve, reject, rename, reopen, merge, and create topics for an App. Both of its Store Connections share the catalogue.

- Renaming preserves the topic identifier and assignments.
- Merging requires a surviving topic; its status is retained and source labels become aliases.
- Rejecting requires confirmation and removes assignments and manual topic corrections. Reopening does not restore them.
- Rejected topics block equivalent proposals until reopened.

## Availability

Analysis covers all imported history in resumable batches; it cannot retrieve history absent from the Store API. Changed Reviews wait for fresh automatic analysis. Catalogue edits do not reclassify all previous Reviews.

The deployment operator enables Jev with `TYPESAFE_API_KEY` and Luna with the generative provider settings. Missing configuration leaves stored results readable. Classification and discovery are separate from Reply Draft quotas; discovery runs in bounded batches without a published commercial quota. See [self-hosting](/docs/self-hosting/) for configuration.
