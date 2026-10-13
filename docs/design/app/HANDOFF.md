# App redesign — handoff

Reference mockups for aligning `apps/web` (Angular, PrimeNG + Tailwind v4) on the design system in `/DESIGN.md`. The marketing site is not changing.

## Files → routes

| Mockup | Screen |
|---|---|
| `Inbox.dc.html` | Reply Inbox: status tabs, list/detail split, Reply Draft box |
| `Analysis.dc.html` | Analysis: filter chips, stat tiles, severity bars, stacked volume, topics table |
| `Apps.dc.html` | Apps: one card per App with both Store Connections, secondary actions in a footer |
| `Audit.dc.html` | Audit History: grouped by day, status pills, review excerpt, failure reason |
| `Topics.dc.html` | Topic catalogue: Luna proposals (approve / rename / reject), catalogue table |
| `ReplySettings.dc.html` | Reply settings: Reply Language Policy + Reply Context entries |
| `Connect.dc.html` | Connect app flow: 4-step stepper, Store Credential step |
| `Organization.dc.html` | Organization: plan & usage meters, members |
| `design-system.dc.html` | Token and component sheet |

## How to read them

- Only the markup inside `<x-dc>` matters. Ignore `support.js`, `<helmet>` and the `text/x-dc` script.
- Inline hex values are the **dark** theme. Map each one to its `DESIGN.md` token (`bg-surface-1`, `text-ink-muted`, …) and use the light values when the theme is light.
- Use PrimeNG components (Select, Tabs, Table, Textarea, Button, ProgressBar) themed through the PrimeNG preset. Don't copy inline styles. Component CSS files are not allowed (`AGENTS.md`).
- Values shown as `[n]`, `[x]` or `[date]` are placeholders for real data. Reviewer names are fictional.

## Not confirmed in the current product (check before building)

- "Failed" tab in the Reply Inbox, and the "Load older events" pagination in Audit History.
- Last Sync Run status per Store Connection on the Apps card.
- "Used in [n] drafts" count on Reply Context entries.
- Rename action on Luna proposals, and the Restore action on rejected topics.
- Usage meters and the near-limit warning on Organization.
