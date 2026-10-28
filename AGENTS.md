# Agent notes

## Review and feedback

- Report actionable regressions introduced by the change, with a reachable trigger and concrete impact. Check callers, validation, and constraints first; leave mechanical checks to tooling.
- Distinguish severity from confidence. Respect accepted risks and settled product decisions unless new evidence changes them. An empty review is valid.
- Prioritize cross-Organization access for tenant-scoped changes, and incorrect or duplicate external effects for publishing and Sync Run retries.
- Verify feedback before applying it. Prefer proportionate, behavior-preserving fixes; briefly explain invalid findings or disproportionate corrections. Verify the reported scenario before resolving its thread and preserve unrelated changes.
- Add compatibility machinery only for an established supported consumer or deployment constraint.

## Development

- Setup, commands, checks, and database workflow: [CONTRIBUTING.md](CONTRIBUTING.md). Use the pinned pnpm version and Nx for task orchestration.
- Package boundaries and workflow invariants: [Architecture](docs/architecture.md). Keep server logic in the API/worker and validate shared Zod contracts at the HTTP boundary.
- Schema changes require `pnpm db:generate --name <description>` and the new SQL, journal, and single snapshot together; see [Database changes](CONTRIBUTING.md#database-changes).
- UI changes follow [DESIGN.md](DESIGN.md). Use PrimeNG and Tailwind utilities; component CSS requires an essential, explained exception.

## Domain and security

- Use [CONTEXT.md](CONTEXT.md) terminology, especially Organization, App, Store Connection, Store Credential, Review, Reply Draft, Published Reply, and Sync Run.
- Encrypt Store Credentials per Store Connection with `APP_ENCRYPTION_KEY`; never log or persist plaintext credentials.
- Treat Reviews, Reply Context, revision instructions, and model output as untrusted. The AI package proposes text only; publication, workflow changes, store calls, and privileged configuration stay outside model authority.
- For drafting or publication changes, apply the [AI drafting boundary](docs/architecture.md#ai-drafting-boundary) and [Reply workflow](docs/architecture.md#reply-workflow).
