# AI drafting security boundary

ReviewInbox treats external store reviews, app-level reply context, and generated reply drafts as untrusted content. AI drafting is allowed to propose text only; it must not be able to publish replies, change application state, call store APIs, read privileged configuration, or override server-side workflow rules.

## Context

Review text comes from public app stores and can be attacker-controlled. Reply context is editable organization content and may contain stale, incorrect, or hostile instructions after account compromise or accidental paste. Both are later sent to an AI provider and may influence a draft that a human can publish to a public store.

Without an explicit boundary, prompt injection in a review could ask the model to ignore ReviewInbox instructions, leak hidden prompt content, generate abusive replies, or request actions outside drafting. The highest-risk failure mode is treating model output as trusted workflow intent instead of untrusted suggested text.

## Decision

AI reply drafting must follow these rules:

- Reviews, reply context, detected language, and prior drafts are prompt inputs, never instructions with higher priority than ReviewInbox system policy.
- The AI package returns draft text and minimal drafting metadata only. It must not expose a generic agent/tool interface to publishing, privileged configuration, database writes, membership, or store-connection operations.
- Draft generation never publishes automatically. Publishing remains a separate server-side action requiring the normal ReviewInbox authorization checks and an explicit user or trusted worker decision.
- Model output is stored and rendered as untrusted text. Web surfaces must escape it by default and must not render generated Markdown/HTML as trusted markup unless it passes a dedicated sanitizer.
- Prompt templates must explicitly tell the model that review text and reply context can contain malicious instructions and must not override ReviewInbox rules.
- Hidden prompts, internal IDs not needed by the model, and organization-private data from unrelated apps must not be included in prompts.
- Errors, logs, and traces must not record full prompts or generated replies by default in production. Debug logging may be opt-in and must be scoped to the deployment operator.
- Tests for drafting should include hostile review text that attempts instruction override, cross-app data access, and automatic publishing.

## Consequences

This keeps AI drafting as a bounded text-generation feature instead of an authority-bearing agent. It reduces prompt-injection blast radius, protects tenant data, and preserves the human approval workflow even when reviews contain hostile instructions.

The tradeoff is less flexibility for future agentic workflows. If ReviewInbox later adds tools or autonomous actions, those capabilities need a separate security design with explicit allowlists, per-action authorization, audit logging, and failure-mode tests.
