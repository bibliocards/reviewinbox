# Reply inbox and publishing

ReviewInbox M4 adds the first end-to-end human workflow for turning imported reviews and Reply Drafts into Published Replies.

## Decision

M4 supports creating the first store reply for a review. It does not support editing or replacing an existing store-side reply.

Publishing is a synchronous server action. A user publishes an existing saved Reply Draft, or uses the edit/manual reply dialog to save draft text before publishing. Published drafts are immutable; future edits to Published Replies are outside M4.

Pending reviews without a draft remain visible in the Reply Inbox. They offer a primary action to enqueue draft generation through the existing worker path and a secondary manual reply action using the same dialog as editing before publish. M4 does not poll for generated drafts after enqueueing.

The Reply Inbox defaults to actionable reviews: `drafted`, `failed`, and `pending`. It sorts `drafted` first, then `failed`, then `pending`, with newest review date inside each group. `ignored` and `published` remain available as filters. M4 supports filtering by App, not by Store Connection.

Any organization member may edit drafts, ignore reviews, unignore reviews, enqueue draft generation, create manual drafts, and publish replies. Audit events record the actor, action, review, timestamp, and minimal metadata.

`failed` continues to mean draft generation failed. Publish failures do not move a review to `failed`; the review remains `drafted` and the failure is recorded in audit history.

Ignoring is reversible. Unignoring returns the review to `drafted` when a Reply Draft exists, otherwise to `pending`.

Published Reply records store immutable reply text and the external store reply reference when the provider returns one. Raw store publish API responses are not stored by default.

Concurrent publishing is guarded server-side with a PostgreSQL advisory lock rather than adding a durable `publishing` status. The server also checks that the review is still `drafted` and has no Published Reply before calling the store.

## Consequences

The first M4 publishing path stays narrow and auditable. Every Published Reply comes from a saved Reply Draft, and store publishing remains separate from AI drafting.

The workflow deliberately avoids draft version history. Audit events do not store full draft text snapshots; `reply_drafts.draftText` represents the current editable draft before publish, and `published_replies.replyText` represents the immutable published snapshot.

If a store publish succeeds but local recording fails, the result is reconciliation-critical. The API should surface failure and avoid blind retries that could duplicate or reject replies.

Future work can add store-side reply reconciliation, editing Published Replies, bidirectional UI updates, richer roles, and draft version history without changing the M4 invariants.
