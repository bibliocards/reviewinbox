# Review data ownership

Each ReviewInbox review belongs to an organization, an app, and the store connection that imported it. Reviews are unique by store connection and external review identifier.

## Consequences

The app relationship supports fast product-facing queries and UI navigation, while the store connection relationship preserves exact provenance if store credentials or app configuration change over time. Authorization must scope review access through the owning organization.
