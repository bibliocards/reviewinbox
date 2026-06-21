# Usage, Limits, And Cloud Readiness

This note records the M5 billing and usage model for ReviewInbox.

## Billing Boundary

Billing and limits live behind `packages/billing`. The package owns plan definitions, effective limits, usage period helpers, usage event types, and enforcement decisions. It does not integrate Stripe yet.

## Plans

| Plan | Price | Members | Apps | Store Connections | Reviews/month | Managed AI Reply Drafts/month |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `free` | $0/month | 1 | 1 | 2 | 30 | 5 |
| `starter` | $9/month | 3 | 2 | 4 | 500 | 100 |
| `pro` | $29/month | 10 | 10 | 20 | 5,000 | 1,000 |
| `business` | $99/month | 25 | 50 included, 100 limit | 100 included, 200 limit | 50,000 | 10,000 |

Prices are listed in USD. Current overage planning:

- 100 Managed AI Reply Drafts for $5.
- 1,000 Review imports for $5.
- 1 extra member seat for $5/month.

## Included Usage And Caps

The model separates included usage from hard limits or Owner caps.

- Included usage describes what the plan includes.
- Limit/cap describes where the product blocks usage.
- Future overages should require explicit Owner cap changes before extra usage is allowed.

## Usage Events

Current usage event types:

- `review_imported`
- `managed_ai_reply_draft_generated`
- `published_reply_created`
- `weekly_digest_generated`

`review_imported` is recorded only on first import. Review updates from later Sync Runs do not consume review import quota.

`managed_ai_reply_draft_generated` is recorded only when ReviewInbox managed AI creates a Reply Draft. Failed generations and manual editing do not consume Managed AI quota.

`published_reply_created` is recorded for visibility but is not directly limited.

## Enforcement

Cloud deployments enforce limits. Self-hosted deployments do not enforce billing limits.

Cloud enforcement points:

- App creation.
- Store Connection creation.
- Organization member limit through Better Auth organization membership limits.
- Manual sync availability by plan.
- Partial sync when monthly Review import cap is reached.
- Managed AI Reply Draft generation cap.

Read, edit, export, and delete operations should remain available for over-limit Organizations.

## Multi-Organization Model

Billing attaches to an Organization, not to a user account.

- A user may belong to multiple Organizations.
- Each Organization has its own plan, limits, caps, and usage period.
- Future Stripe integration should upgrade one Organization at a time.
- Agency or multi-client packaging can be introduced later without changing the core Organization billing model.

## Later: Anti-Abuse M5/M6

Free Organizations can be abused to bypass usage limits. Treat this as cloud anti-abuse, not as the primary pricing model.

Options to revisit later:

- Soft limit such as `maxFreeOrganizationsCreatedPerUser = 3`.
- Email/domain verification or stronger rate limits.
- "Contact us" flow if Organization creation looks abusive.

Do not implement user-level billing unless the product explicitly targets agency packaging. Keep the default model Organization-scoped.
