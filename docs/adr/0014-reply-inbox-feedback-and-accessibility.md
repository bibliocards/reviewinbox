# Reply Inbox feedback and accessibility

ReviewInbox's Reply Inbox is a public-response workflow, so V1 must treat feedback, safety, and accessibility as core behavior rather than visual polish.

## Decision

The Reply Inbox UI should expose each review as a clear work item with enough text to understand state without relying on color, position, or iconography alone. At minimum, each item should show the app, store, rating, review language, reply status, and safest next action.

AI reply drafts are editable suggestions, not final replies. The interface must visually and semantically separate the original review, generated draft, user edits, and published reply. Publishing remains an explicit user action because it sends a public response to an external store.

V1 should include designed states for the main workflow:

- Empty: explain that synced store reviews will appear here and point to the store-connection setup path.
- Loading: preserve the inbox layout where possible and avoid implying that drafts or publishes have completed.
- Drafted: show when the draft was generated, the chosen reply language, and that the user can edit before publishing.
- Failed: name the failed step (`sync`, `draft`, or `publish`) and provide the safest retry action.
- Ignored: confirm that no public reply will be sent and keep the audit history available.
- Published: confirm the external store that received the reply and keep the final text accessible.

Keyboard and assistive-technology support must be part of the first implementation. Filters, review selection, draft editing, ignore actions, retry actions, and publish actions need visible focus states, accessible names, and a logical tab order. Rating, language, and status indicators need text labels, not just badges, icons, or color.

Motion may be used only to clarify state changes, such as a draft appearing or a published review leaving the active queue. Any motion must be subtle and respect reduced-motion preferences.

## Consequences

M4 should not be considered complete until empty, loading, drafted, failed, ignored, and published states are implemented and manually checked with keyboard navigation.

This keeps the first Reply Inbox simple while avoiding costly retrofits for safe publishing feedback, status clarity, and accessibility after users already rely on the workflow.
