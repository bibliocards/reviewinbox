---
title: Usage and limits
description: Organization plan limits, usage accounting, and sync availability.
---

Cloud plans and limits belong to each Organization. A user may belong to several Organizations with separate plans and usage. Owners/admins manage subscriptions from Organization settings; see [pricing](/pricing/) for prices.

## Cloud limits

| Plan | Members | Apps | Store Connections | Review imports/month | AI Reply Drafts/month | Auto-sync | Manual sync |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| Free | 1 | 1 | 2 | 30 | 5 | Every 24 hours | No |
| Starter | 3 | 2 | 4 | 500 | 100 | Every 6 hours | Yes |
| Pro | 10 | 10 | 20 | 5,000 | 1,000 | Every 6 hours | Yes |
| Business | 25 | 50 included, 100 limit | 100 included, 200 limit | 50,000 | 10,000 | Every 6 hours | Yes |

Automatic sync requires an enabled worker and may be spread across its scheduling window. Store Connection verification triggers the initial Sync Run, including on Free.

## What consumes usage

- A Review counts on its first import. Later updates do not consume another import.
- A successful AI Reply Draft or regeneration proposal consumes one draft unit, even when you discard the proposal. Failed generations and manual writing/editing consume none.
- Publication is recorded for visibility, without a publication quota.
- Review analysis is separate from Reply Draft usage. Topic discovery is separately metered in bounded batches; commercial discovery quotas are not implemented.

Monthly import and AI draft periods use UTC calendar months. At the import cap, a Sync Run keeps the Reviews it can import and finishes as partial. At the draft cap, generation stops. Creating Apps, Store Connections, and memberships also checks Organization limits. Upgrade the Organization to raise its limits; overage-pack purchasing is not available.

## Self-hosting

Self-hosted deployments do not enforce Cloud billing limits. Operators configure their own AI provider and run infrastructure, backups, SMTP, and updates. See the [self-hosting guide](/docs/self-hosting/).
