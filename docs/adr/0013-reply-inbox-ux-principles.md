# Reply Inbox UX principles

ReviewInbox treats the Reply Inbox as a production work queue, not a decorative dashboard. The V1 interface should optimize for fast triage, confidence before publishing, and accessible review of AI-generated drafts.

## Decision

The Reply Inbox UI must make each review's state, required next action, and publication risk clear without relying on color alone. Every review row or card should expose the store, app, rating, review language, reply status, and the primary next action in scannable text.

AI-generated reply drafts must be presented as editable suggestions. The interface should distinguish clearly between the original review, the generated draft, user edits, and the final published reply. Publishing must remain an explicit user action with a confirmation or equivalent friction when the reply will be sent to an external store.

Status feedback should be specific and humane:

- Empty states explain what will appear next and how to connect a store if no reviews are available.
- Loading states preserve layout where possible and avoid implying that replies are already ready.
- Failed sync, generation, and publishing states show the failing step and the safest retry action.
- Success states confirm the published store and preserve audit history access.

The interface should support keyboard and assistive-technology workflows from the start. Filters, review selection, draft editing, ignore actions, and publish actions need visible focus states, accessible names, and a logical tab order. Rating, status, and language indicators must include text labels, not only icons or color.

Motion should be subtle and respect reduced-motion preferences. Use transitions only to clarify state changes such as a draft appearing, a review moving out of the queue, or a publish action completing.

## Consequences

M4 implementation should include UX acceptance checks for empty, loading, failed, drafted, ignored, and published states before the Reply Inbox is considered usable end to end.

ReviewInbox can still start with a simple list-and-detail layout, but the first version should not defer accessibility, clear status copy, or safe publishing feedback as later polish. These details are part of the core workflow because users are sending public replies on behalf of an app.
