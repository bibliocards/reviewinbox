# Billing boundary

ReviewInbox V1 records usage events and organization limits internally without integrating a billing provider. The codebase keeps a `packages/billing` boundary so the cloud service can later adopt the better-auth Stripe plugin for organization subscriptions, plans, and limits.

## Considered Options

- PayKit was deferred because ReviewInbox does not yet need a full embedded billing framework or advanced metered billing.
- Direct Stripe integration was deferred because billing should not block the reply inbox MVP.
- The better-auth Stripe plugin is preferred for cloud beta because ReviewInbox already uses better-auth and billing is tied to organizations.

## Consequences

Self-hosted deployments can remain billing-free. Cloud deployments can enforce plan limits using internal usage events first, then attach Stripe subscription state later without rewriting product code.
