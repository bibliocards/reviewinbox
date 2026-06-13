# ReviewInbox

Open-source AI inbox for App Store and Google Play reviews.

ReviewInbox helps mobile app teams import store reviews, generate reply drafts, edit and publish replies back to the stores, then turn recurring review pain into weekly product digests.

## Product Direction

ReviewInbox starts with the reply workflow first:

- import App Store and Google Play reviews;
- generate AI reply drafts automatically;
- let a human edit, ignore, or publish each reply;
- keep audit and publishing history;
- support multiple apps per organization;
- add weekly pain digests after the inbox workflow is useful end to end.

ReviewInbox is not a feedback board. It reads existing public store feedback and turns it into replies, patterns, and actions.

## Open Source And Cloud

The repository is licensed under Apache-2.0.

The open source product should remain useful when self-hosted. The hosted cloud service at `reviewinbox.app` will sell convenience: managed hosting, scheduled jobs, managed AI, email delivery, backups, onboarding, and support.

Both self-hosted and cloud deployments use the same codebase, with behavior selected through configuration.

## Technical Direction

- Monorepo: pnpm workspaces and Turborepo
- Product app: TanStack Start, React, shadcn/ui
- Marketing site: Astro
- Worker: Node.js service for sync, AI drafts, and digests
- Database: Postgres with Drizzle
- Auth: better-auth with organizations
- Queue: pg-boss
- AI: Vercel AI SDK behind a ReviewInbox-owned package boundary
- Deployment: Docker Compose on a VPS

## Project Context

See `CONTEXT.md` for the canonical project glossary and `docs/adr/` for architectural decisions.

## Status

ReviewInbox is in early planning. The first implementation milestone is repository foundation, followed by auth, multi-app support, store sync, AI reply drafts, and the reply inbox.
