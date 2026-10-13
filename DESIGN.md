# ReviewInbox Design System

One visual system for the marketing site (`apps/site`), the docs (Starlight) and the product app (`apps/web`). The marketing site, as shipped, is the reference implementation: its `site-*` tokens in `apps/site/src/styles.css` carry the dark values below, and the app aligns on it. Reference mockups live in the design canvas and in `docs/design/`.

## Principles

- **Dark-first, product-led.** The product is the hero. Marketing pages show the Reply Inbox, not illustrations.
- **One accent, used sparingly.** Indigo `primary` marks the primary action, focus, the active tab, count badges and the "waiting on a human" state. It is never decorative and never a section background.
- **Color carries meaning, not mood.** Beyond the accent, color appears only for workflow status and reported severity, with the same values everywhere.
- **Depth from surfaces and hairlines.** Hierarchy comes from the surface ladder and 1px borders. There are no drop shadows on dark, only an optional 1px top highlight on large panels.
- **Humans publish.** The UI always makes it obvious that AI drafts and people decide: drafts look provisional, and Publish is the only primary button.

## Color tokens

Token names are semantic and shared by both apps. In Tailwind v4 they are declared as `--color-<name>` inside `@theme`, so utilities read `bg-surface-1`, `text-ink-muted`, `border-border`, and so on.

### Neutrals

| Token | Dark | Light | Use |
|---|---|---|---|
| `canvas` | `#08090B` | `#F7F7F5` | Page background |
| `sunken` | `#0B0C0E` | `#F1F2F4` | App sidebar, alternate site bands, table group rows |
| `surface-1` | `#0E0F12` | `#FFFFFF` | Panels, cards, inputs on canvas |
| `surface-2` | `#121318` | `#F6F7F9` | Nested blocks (draft box, code) |
| `surface-3` | `#17181D` | `#ECEEF2` | Hover, active nav item, selected segment |
| `hairline` | `#1C1E22` | `#E6E8EC` | Dividers inside panels |
| `border` | `#23252A` | `#DCDFE5` | Card and input borders |
| `border-strong` | `#2C2F35` | `#C4C8D1` | Secondary buttons, chips, focus-adjacent borders |
| `ink` | `#F4F5F6` | `#16171B` | Headings and primary text |
| `ink-muted` | `#A9AEB8` | `#4B5160` | Body copy and descriptions |
| `ink-subtle` | `#8A8F98` | `#666C7A` | Metadata, timestamps, captions only |

`ink-subtle` passes 4.5:1 on `canvas` and `surface-1` in both themes. Don't go lighter for text.

### Accent

| Token | Dark | Light | Use |
|---|---|---|---|
| `primary` | `#5B63E0` | `#5B63E0` | Primary button fill, focus ring, active tab underline, badges |
| `primary-hover` | `#7A82F0` | `#4A52CF` | Hover on primary, eyebrow text on dark |
| `primary-tint` | `#1D2040` | `#ECEDFC` | Drafted pill background, AI marker |
| `primary-tint-ink` | `#AEB3FF` | `#3F47B8` | Text on `primary-tint` |
| `selected` | `#13152A` | `#F0F1FD` | Selected list row, featured plan |
| `selected-border` | `#3A3F8F` | `#B9BDF5` | Border of `selected` |
| `link` | `#C9CCFF` | `#4A52CF` | Inline links |

Text on `primary` is always white. The focus ring is `2px solid primary` at 50% opacity with a 2px offset.

### Workflow status

These map to the `reply_status` and `reply_audit_action` values. Use them in the Reply Inbox, Audit History and marketing mockups.

| Status | Background (dark / light) | Text (dark / light) | Notes |
|---|---|---|---|
| Pending / Imported | transparent + `border-strong` | `ink-muted` | Outlined, no fill |
| Drafted / Draft created / Draft edited | `primary-tint` | `primary-tint-ink` | Waiting on a human |
| Published | `#1C2A20` / `#E6F5EA` | `#6BD38A` / `#1F7A3A` | Done in the store |
| Ignored | transparent, dashed `#4A4E57` / `#C4C8D1` | `ink-muted` | Dashed border = inactive |
| Failed / Publish failed | `#241214` / `#FDECEC` | `#FF8C8F` / `#B42328` | Show the reason under the row |
| Connected (Store Connection) | same as Published | same as Published | |

Green means "done in the store", indigo means "waiting on a human", and red is only for failures and blocking severity. Don't use purple for Published, as the current app does.

### Reported severity

The ordered scale is shared across Apps. Dots, bars and chart segments use the solid color. A pill uses a tinted background with lighter text.

| Level | Solid | Notes |
|---|---|---|
| Critical | `#B4232A` | |
| Blocking | `#E5484D` | Pill: bg `#241214`, border `#4A1F22`, text `#FF8C8F` (dark) |
| Degraded | `#F76B15` | |
| Minor | `#F0B54A` | |
| No problem | `#4A4E57` (dark) / `#C4C8D1` (light) | Neutral, not green |
| Unknown | dashed outline in `ink-subtle` | Never a fill |

The order also runs from warm to neutral in lightness, so the scale still reads for color-blind users. Always pair the color with the level name. Star ratings use `#F0B54A`, or `#B7791F` on light.

Warning (near a usage limit): bg `#17130B` / `#FDF3E1`, border `#4A3A1A` / `#F0D9A8`, text `#F0C77A` / `#8A5A00`.

## Typography

- **Families:** Geist for UI and display, Geist Mono for counts, IDs, character counters and small uppercase labels. Self-host with `@fontsource-variable/geist` and `@fontsource-variable/geist-mono`; they replace Inter and JetBrains Mono in both apps.
- **Weights:** 400 for body, 500 for labels and buttons, 600 for headings. Don't use 700 or more.

| Token | Size / line height | Weight | Tracking | Where |
|---|---|---|---|---|
| `display` | clamp(44px, 6.4vw, 84px) / 1.02 | 600 | -0.045em | Site hero |
| `h2-site` | clamp(32px, 4vw, 48px) / 1.1 | 600 | -0.035em | Site section titles |
| `page-title` | 26px / 1.2 | 600 | -0.6px | App page header |
| `section-title` | 16–22px / 1.3 | 600 | -0.3px | Panels, cards |
| `lead` | 17–19px / 1.55 | 400 | 0 | Site intros |
| `body` | 14px app, 16px site / 1.5 | 400 | 0 | Default |
| `caption` | 12–13px / 1.4 | 400 | 0 | Meta, help text |
| `eyebrow` | 13px | 500 | +0.04em | Site section labels, `primary-hover` color |
| `mono-label` | 11px, uppercase | 500 | +0.08em | "REPLY DRAFT · AI" |

Write sentence case everywhere, and use the `CONTEXT.md` terms with their capitals (Reply Inbox, Store Connection, Reply Draft, and so on).

## Spacing, radius, layout

- **Spacing:** 4px base. Tokens are `xxs` 4, `xs` 8, `sm` 12, `md` 16, `lg` 24, `xl` 32, `xxl` 48, `section` 96–112.
- **Radius:** `xs` 4 (status pills, chips), `md` 8 (buttons, inputs, nav items), `lg` 12 (cards, stat tiles), `xl` 14–16 (panels, product mock frames), `xxl` 20 (site CTA banner), `full` (avatars, count badges). Primary actions are never pill-shaped.
- **Site container:** max 1200px with a 24px gutter. Sections are 96–112px apart and separated by a `hairline` rule or a `sunken` band.
- **App shell:** sidebar of 232px (`sunken`, right `hairline`) and a top bar of about 62px (breadcrumb or search left, actions right). Content padding is 24px; settings pages are capped at 1040px.
- **Responsive:** use wrapping flex/grid (`flex-wrap`, `repeat(auto-fit, minmax(...))`) rather than breakpoint ladders. Below about 900px the sidebar stacks above the content and the list/detail split in the Reply Inbox becomes one column. Wide tables scroll inside their own box. Touch targets are at least 44px on touch devices and 40px otherwise.

## Components

Each component exists once and is used the same way on the site and in the app. In `apps/web`, prefer PrimeNG components themed with these tokens. Use the Tailwind utilities below for anything custom.

### Buttons
- **Primary:** `primary` fill, white text, weight 500, radius `md`, padding 10×16, height 40 (44 on touch). Use one per view; in the Reply Inbox it is always "Publish reply".
- **Secondary:** `surface-1` fill, `border-strong` border, `ink` text.
- **Quiet:** transparent, `border-strong` border, `ink-muted` text. Use for Ignore, Back, Cancel.
- **Link action:** text only, `link` color.
- **Destructive:** transparent, red border `#4A1F22`, text `#FF8C8F` (light: border `#F3C1C3`, text `#B42328`).
- **Icon button:** 38–40px square, `border` outline, and a required `aria-label`.

### Inputs and filters
- Inputs use `surface-1` (or `sunken` inside a panel), a `border` outline, radius `md` and padding 9×12, with a visible `<label>`.
- Filter chips show "Label value", for example "Store · All stores", with the label in `ink-subtle`. Disabled filters use a dashed border and a reason ("Version · select an App first").
- Segmented controls sit in a single `border` frame; the selected segment uses `surface-3`.
- Tabs are text with a 2px `primary` underline on the active tab and a mono count.

### Pills and badges
- Status pills are radius `xs`, 12px text, padding 1–2×6–8, colored by the status table above.
- Metadata chips (store, version, language, topic, intent) are outlined in `border-strong` with `ink-muted` text.
- Pending topics (proposed by Luna) use a dashed border and appear with reduced emphasis everywhere.
- Count badges are radius `full`, `primary` fill, mono 12px.

### Cards and panels
- **Panel:** `surface-1`, `border`, radius `xl`, padding 20–24, optional `inset 0 1px 0 rgba(255,255,255,.05)` highlight in dark mode.
- **Stat tile:** label (`ink-muted`), value (32px/600), caption (`ink-subtle`). An alert variant uses the severity tint, links to the filtered Reviews, and is used only for "Needs attention".
- **Selected row/card:** `selected` background with a `selected-border` outline.
- **Empty state:** dashed `border-strong` panel, one sentence on why it's empty, one action.

### Domain patterns
- **Review item (list):** stars, store, severity dot, relative time, title, one-line excerpt, status pill.
- **Review detail:** metadata chips → title + stars → author · time → body → severity/topic/intent chips → Reply Draft box → actions.
- **Reply Draft box:** `surface-2`, a mono label "REPLY DRAFT · AI", the Reply Context used, an editable textarea, and a character counter against the store limit (350 for Google Play).
- **Severity bar:** a row with a dot, name, track (`surface-3`), fill and mono count. The row is a `<button>` that filters.
- **Store Connection block:** store name, status pill, last Sync Run, masked Store Credential (`•••• encrypted`). Never show credential material.
- **Product mock frame (site):** panel with window dots and a mono URL bar, containing real app markup rather than a screenshot.

## Accessibility

- Text contrast is at least 4.5:1 (3:1 at 24px and above) in both themes. Check pills and tinted tiles too.
- Severity and status never rely on color alone: always pair them with a label or icon. Unknown uses a dashed shape.
- Use real `<button>`, `<a href>` and `<label>` elements. Icon-only controls need an `aria-label`, and decorative SVGs need `aria-hidden`.
- Focus must be visible on every interactive element (see the focus ring above).

## Don't

- No gradients, glows, spotlight cards or emoji in the UI.
- No second accent color, and no purple or green used decoratively.
- Don't use `primary` for anything that isn't actionable or "waiting on a human".
- No component CSS files: use Tailwind utilities and shared tokens (see `AGENTS.md`).
- No invented metrics, testimonials or logos on the site; use placeholders until real data exists.

## Implementation

1. **apps/site stays as is.** Its `site-*` tokens are the source of the dark values. Don't restyle the site to match this file. Two known differences are accepted: its marketing mockup shows "Drafted" in green and labels severity High/Medium/Low.
2. **apps/web:** add the tokens above to `apps/web/src/styles.css` `@theme`, using the light values by default and the dark values under `html.dark`, which matches the current theme toggle.
3. **apps/web:** rename `linear-primary*` to `primary*`, replace the current light and dark values, switch fonts to Geist, and map PrimeNG's preset (`primary`, `surface`, `content` and `formField` tokens) to these variables. Replace `.ri-chip` with the status and metadata pill patterns.
4. **Status colors:** centralize the status → classes mapping in a single helper in `apps/web` so the Inbox, Audit History and Analysis stay in sync.
