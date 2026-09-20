# Reply inbox and publishing

ReviewInbox M4 adds the first end-to-end human workflow for turning imported reviews and Reply Drafts into Published Replies.

## Decision

M4 initially supported creating only the first store reply for a review. [Issue #26](https://github.com/bibliocards/reviewinbox/issues/26) extends this workflow to updating a Published Reply after the Review changes.

Publishing is a synchronous server action. A user publishes an existing saved Reply Draft, or uses the edit/manual reply dialog to save draft text before publishing. A changed Review can receive a new Reply Draft while its existing Published Reply remains visible for comparison. Only explicit human publication replaces that Published Reply.

Pending reviews without a draft remain visible in the Reply Inbox. They offer a primary action to enqueue draft generation through the existing worker path and a secondary manual reply action using the same dialog as editing before publish. M4 does not poll for generated drafts after enqueueing.

The Reply Inbox defaults to actionable reviews: `drafted`, `failed`, and `pending`. It sorts `drafted` first, then `failed`, then `pending`, with newest review date inside each group. `ignored` and `published` remain available as filters. M4 supports filtering by App, not by Store Connection.

Any organization member may edit drafts, ignore reviews, unignore reviews, enqueue draft generation, create manual drafts, and publish replies. Audit events record the actor, action, review, timestamp, and minimal metadata.

`failed` continues to mean draft generation failed. Publish failures do not move a review to `failed`; the review remains `drafted` and the failure is recorded in audit history.

Ignoring is reversible. Unignoring returns a Review without a Published Reply to `drafted` when a Reply Draft exists, otherwise to `pending`. For a Review with a Published Reply, unignoring restores the unresolved change and returns it to `pending` so a retained, obsolete draft cannot be published directly.

Published Reply records store the latest successfully published reply text and the external store reply reference when the provider returns one. Editing a Reply Draft never changes this published snapshot. Raw store publish API responses are not stored by default.

Concurrent publishing is guarded server-side with a PostgreSQL advisory lock rather than adding a durable `publishing` status. Review row locks serialize publication and other user actions with synchronization. The server checks that the Review is still `drafted`; an existing Published Reply is accepted only when the Review has an unresolved change after publication.

### Reviews edited after publication

A Sync Run compares title, body, and rating against the currently stored Review. A relevant change to a Review with a Published Reply sets `changedAfterReply` and returns it to `pending`, including when a draft already exists. Identical content and unrelated metadata do not reopen it. A Sync Run never publishes a reply.

`replyBaseline` retains the Review content associated with the latest successful publication. Further edits and ignoring a change preserve this comparison. Ignoring acknowledges the currently retrieved content, so only another relevant edit reopens the Review. Successful publication replaces the baseline with the current Review and clears the unresolved change.

Existing Published Replies have no historical baseline backfilled. The interface reports that the previous version is unavailable. On a future detected change, the stored Review content can become the comparison baseline; it cannot reconstruct edits that happened before version retention existed.

Both [Apple's customer review response endpoint](https://developer.apple.com/documentation/appstoreconnectapi/post-v1-customerreviewresponses) and [Google Play's review reply endpoint](https://developers.google.com/android-publisher/api-ref/rest/v3/reviews/reply) support creating or replacing a response through the same POST request. Updating a reply uses these existing adapter workflows.

## Consequences

The first M4 publishing path stays narrow and auditable. Every Published Reply comes from a saved Reply Draft, and store publishing remains separate from AI drafting.

The workflow deliberately avoids draft version history. Audit events do not store full draft text snapshots; `reply_drafts.draftText` represents the editable draft, and `published_replies.replyText` represents the latest published snapshot. A retained draft from before a Review edit is not publishable until a new draft is generated or explicitly saved.

If a store publish succeeds but local recording fails, the result is reconciliation-critical. The API should surface failure and avoid blind retries that could duplicate or reject replies.

Future work can add store-side reply reconciliation, bidirectional UI updates, richer roles, and draft version history.
