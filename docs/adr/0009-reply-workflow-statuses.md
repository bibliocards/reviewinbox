# Reply workflow statuses

ReviewInbox V1 uses a simple reply workflow without a durable `approved` status. A human publishing action is the approval moment, and the audit trail records who published or ignored a review.

## Consequences

The initial reply status model is `pending`, `drafted`, `published`, `ignored`, and `failed`. A separate approval queue can be added later if ReviewInbox supports batch publishing, multi-step review, or role-based approvals.
