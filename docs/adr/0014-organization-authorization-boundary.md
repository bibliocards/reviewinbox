# Organization authorization boundary

ReviewInbox enforces organization membership and role checks on the server for every tenant-owned resource and privileged action. Client-side routing, selected organization state, external store identifiers, and request-provided foreign keys are convenience inputs only; they are never proof of authorization.

## Context

ReviewInbox is multi-tenant by design. Organizations own apps, store connections, imported reviews, reply drafts, published replies, usage events, and future weekly digests. Many API calls will naturally include short identifiers such as `organizationId`, `appId`, `reviewId`, `storeConnectionId`, or external App Store / Google Play review identifiers.

Without a strict boundary, a user could try insecure direct object reference attacks by swapping IDs in requests, publishing replies for another organization, reading imported reviews from another app, using another tenant's store credentials, or inferring sensitive metadata through error messages and timing differences. Workers and background jobs have the same risk if queued jobs contain attacker-controlled or stale resource identifiers and execute without re-checking ownership.

## Decision

All product code that reads or mutates tenant-owned data must follow these rules:

- Resolve the authenticated user's active membership on the server before accessing organization data.
- Authorize through the full resource chain, not just one request parameter. For example, a reply publish action must prove that the review, app, store connection, draft, and organization all belong together before using store credentials or changing state.
- Treat request-provided organization IDs and resource IDs as selectors that still need ownership checks. Never trust them because they came from the current UI.
- Default to deny when membership, role, resource ownership, or store-connection status is missing, ambiguous, disabled, or soft-deleted.
- Enforce role checks server-side for privileged actions such as connecting stores, changing app reply context, publishing replies, inviting members, exporting data, and changing organization settings.
- Re-check authorization and resource ownership inside workers before sending AI prompts, decrypting store credentials, publishing replies, exporting data, or sending digests. Queue payloads must not be treated as authority.
- Scope database queries by organization and resource relationship in the same query where practical, so missing rows and unauthorized rows do not diverge into separate unsafe code paths.
- Do not expose whether a resource exists in another organization. User-facing responses should use a generic not-found or forbidden result where appropriate, while internal logs may include structured diagnostic context without secrets or credential material.
- Audit privileged cross-boundary actions with actor, organization, resource, action, outcome, and timestamp. Audit records must avoid raw store credentials, full AI prompts, and generated reply bodies unless explicitly needed and protected.
- Tests for tenant-owned APIs and workers must include cross-organization ID swapping, stale membership, disabled store connections, and attempts to publish a reply using resources from different organizations.

## Consequences

This makes tenant isolation an explicit implementation constraint before the API and worker layers exist. It reduces the chance of IDOR, confused-deputy worker execution, credential misuse, and cross-organization data leaks.

The tradeoff is slightly more ceremony in service functions and tests. That cost is acceptable because authorization mistakes in review access, AI prompting, and store publishing would expose customer data or allow public replies to be posted through another tenant's credentials.
