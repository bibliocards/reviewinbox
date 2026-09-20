---
title: Usage And Limits
description: How ReviewInbox Cloud usage, limits, and self-hosted deployments work.
---

ReviewInbox uses the same codebase for Cloud and self-hosted deployments. Cloud Organizations have plan limits. Self-hosted deployments record usage for visibility but do not enforce billing limits.

## Billing Unit

Plans attach to an Organization.

- A user can belong to multiple Organizations.
- Each Organization has its own plan, usage period, and limits.
- Upgrading later should upgrade one Organization, not a global user account.

## Current Cloud Plans

| Plan | Price | Members | Apps | Store Connections | Review imports/month | Managed AI Reply Drafts/month | Automatic sync | Manual sync |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| Free | $0/month | 1 | 1 | 2 | 30 | 5 | Every 24 hours | Not available |
| Starter | $9.99/month | 3 | 2 | 4 | 500 | 100 | Every 6 hours | Available |
| Pro | $29.99/month | 10 | 10 | 20 | 5,000 | 1,000 | Every 6 hours | Available |
| Business | $99.99/month | 25 | 50 included, 100 limit | 100 included, 200 limit | 50,000 | 10,000 | Every 6 hours | Available |

Prices are listed in USD. Free is available for low-volume evaluation.

## What Counts Toward Usage

Review imports count only when a Review is imported for the first time.

- Updating an existing Review during a later Sync Run does not consume Review import usage.
- If a Sync Run reaches the monthly Review import cap, ReviewInbox stores what it can and marks the Sync Run as partial.
- Published Replies are recorded as usage events but are not directly limited.

Managed AI Reply Draft usage counts only when ReviewInbox managed AI creates a Reply Draft.

- Manual editing does not consume Managed AI usage.
- Manually created Reply Drafts do not consume Managed AI usage.
- Failed AI generation does not consume Managed AI usage when no Reply Draft is created.
- Regeneration through managed AI should consume another Managed AI Reply Draft.

Review analysis is separate from Managed AI Reply Draft usage. Jev classification is included for imported Reviews and the initial history backfill, subject to global cost controls and fair queue scheduling. Luna topic discovery is metered separately per Organization and runs in bounded batches; commercial discovery quotas are deferred while usage is measured. Infrastructure retries and catalogue-maintenance reprocessing do not consume user-facing credits.

## Sync cadence and caps

Automatic review sync follows the interval shown in the plan table when the worker and automatic sync are enabled. The worker may spread a run across its configured scheduling window. Manual sync is available on paid Cloud plans and unavailable on Free.

Review imports and Managed AI Reply Drafts stop at the monthly cap. ReviewInbox does not publish an extra-usage charge from this page; upgrade the Organization before the next capped action.

## Cloud Enforcement

Cloud deployments enforce limits at action boundaries.

- Creating an App is blocked when the App limit is reached.
- Creating a Store Connection is blocked when the Store Connection limit is reached.
- Inviting or adding a member is blocked when the member limit is reached.
- Manual sync is unavailable on Free.
- Review import stops partially when the monthly Review import cap is reached.
- Managed AI Reply Draft generation is skipped when the monthly Managed AI cap is reached.

Read, edit, export, and delete operations should remain available even if an Organization is over limit.

## Self-Hosted Deployments

Self-hosted deployments remain billing-free.

- Limits are not enforced.
- Operators can configure the AI provider for the self-hosted deployment.
- Operators are responsible for infrastructure, backups, SMTP, storage, and updates.

See [Self-Hosting ReviewInbox](/docs/self-hosting/) for deployment guidance.
