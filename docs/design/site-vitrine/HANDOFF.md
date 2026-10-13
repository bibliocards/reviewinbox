# Marketing site redesign — handoff

Reference mockups for rebuilding `apps/site` (Astro). Direction "A · Nuit": dark product look, evolution of `DESIGN.md`.

- `home.dc.html` → `apps/site/src/pages/index.astro`
- `pricing.dc.html` → `apps/site/src/pages/pricing.astro`

## How to read the mockups

The files are design-canvas sources, not production code. Use them as the visual and copy spec only:

- The markup between `<x-dc>` and `</x-dc>` is the page. Ignore `<script src="./support.js">`, the `<helmet>` wrapper and the `text/x-dc` script.
- `{{accent}}` = `#5B63E0` (primary). Replace every occurrence.
- Links to `*.dc.html` are internal: `Main.dc.html` → `/`, `Pricing.dc.html` → `/pricing/`. `href="#"` → real targets from the current pages (sign-up URLs via `planSignUpUrl`, `/docs/...`, GitHub).
- Inline styles must become Tailwind utilities (AGENTS.md: no component CSS). Map colors to tokens in `apps/site/src/styles.css`, adding tokens where missing.

## Tokens used

| Role | Value |
|---|---|
| Canvas | `#08090B` |
| Alt section background | `#0B0C0E` |
| Surface 1 / panel | `#101114` / `#0E0F12` |
| Featured surface / border | `#13152A` / `#3A3F8F` |
| Hairline / strong | `#1C1E22`, `#23252A` / `#2C2F35` |
| Ink / muted / subtle | `#F4F5F6` / `#A9AEB8` / `#8A8F98` |
| Primary | `#5B63E0` |
| Success pill | bg `#1C2A20`, text `#6BD38A` |
| Severity high / medium / low | `#E5484D` / `#F0B54A` / `#4A4E57` |

Fonts: Geist (400–700) and Geist Mono (400–500). Display headings use tight negative tracking (≈ -0.045em at hero size).

## Page structure

**Home**: nav → hero (open-source pill, H1 two-tone, 2 CTAs, store/provider line) → product mock (Reply Inbox list + Reply Draft panel, built in HTML, replaces the screenshot) → How it works (4 steps) → Review analysis (topic bars by severity) → pricing teaser (4 cards) → Store Connections (App Store / Google Play) → FAQ (`<details>`) → final CTA → footer.

**Pricing**: nav → header → 4 plan cards (Starter featured) → self-hosted strip → comparison table (horizontal scroll on mobile) → billing FAQ → footer.

## Keep from the current site

Meta/OG/JSON-LD tags, `PUBLIC_APP_URL`-based links, the mobile `<details>` menu, skip link, and the `/docs` Starlight content.

## Open points (confirm before shipping)

- Analysis mock shows `[n] Reviews` placeholders: keep as illustrative labels or remove counts. No invented numbers.
- "Most teams" badge on Starter: remove unless backed by data.
- Pricing FAQ "What counts as an AI Reply Draft?" has a placeholder answer.

## Acceptance

- Works at 375px width without horizontal page scroll (only the comparison table scrolls).
- Text contrast ≥ 4.5:1; touch targets ≥ 44px.
- `pnpm format:check`, `pnpm lint`, `pnpm nx build site` pass.
