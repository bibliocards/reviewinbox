# ReviewInbox design

The app, marketing site, and public docs share a dark-first visual direction, with light mode supported in the product app. The shipped interfaces are the reference.

## Sources of truth

- [App tokens](apps/web/src/styles.css): semantic colors, fonts, spacing, and radii in both themes.
- [PrimeNG preset](apps/web/src/app/shared/theme.ts): component mapping to those tokens.
- [Status classes](apps/web/src/app/shared/badge-classes.ts): workflow and metadata variants.
- [Site styles](apps/site/src/styles.css): marketing and documentation styles.

Use these sources instead of duplicating token values in documentation or component styles.

[HTML mockups](docs/design/) preserve visual intentions. They are design references; the shipped app and code define current behavior.

## Visual rules

- Use indigo for primary actions, focus, selection, and AI drafts awaiting a human decision.
- Use green for successful publication or a connected Store Connection; red for failures; amber for warnings and star ratings.
- Build hierarchy with surfaces and 1px borders. Dark panels use no drop shadows.
- Use Geist for UI text and Geist Mono for identifiers, counts, and small labels. Body weight is 400, labels 500, headings 600.
- Write sentence case and use the [glossary](CONTEXT.md).
- Use the existing spacing and radius tokens. Primary actions have rectangular rounded corners rather than pill shapes.
- Show AI drafts as provisional. Publication always has an explicit human action.

## Components and layout

Use PrimeNG with Tailwind v4 for the product app. Prefer existing shared components and Tailwind utilities. Component CSS files require an essential style that utilities cannot reasonably express; keep exceptions minimal and explain them.

- Forms use visible labels and display errors next to their fields.
- Segmented controls show selection through surface, border, and text treatment.
- Review detail places metadata and Review text before the Reply Draft editor and publication actions.
- Separate workflow status, topic validation, reported severity, and star rating; their meanings differ.
- Pending topics use a visible label and outlined/dashed styling. Rejected topics stay outside active analysis.
- Prefer wrapping layouts and intrinsic grids. Keep wide-table scrolling inside the table container.
- Preserve a clear list/detail hierarchy on desktop and a usable single-column flow on narrow screens.

## Accessibility and content

- Text contrast is at least 4.5:1, or 3:1 for large text.
- Pair color with text, shape, or an icon. Unknown severity must remain distinct from no problem.
- Keep focus visible, provide names for icon-only controls, and translate accessible labels alongside visible labels.
- Use at least 40px controls, or 44px on touch devices. Respect reduced motion.
- Render Reviews and generated replies as escaped text. Preserve line breaks and wrap long content.
- Use real product data or clearly marked placeholders. Marketing mockups are illustrative, not evidence of customer results.
