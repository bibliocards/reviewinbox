# Acquisition and activation fixes — 2026-09-20

Implemented locally following the acquisition audit. No deployment or production configuration change is included.

## Product changes

- Login: wait for the active Organization before rendering organization-scoped pages or fetching usage. Handle activation failure with retry, and missing Organization with a setup link. Resource errors no longer throw during template computation.
- Initial import: enqueue verified Store Connections immediately after connection/credential persistence, including Free. Return a typed enqueue result so the UI distinguishes saved connections from queue failures. Worker execution remains necessary.
- Recovery: implement forgot/reset password routes and SMTP delivery, invalidate sessions on password reset, and replace the empty User settings page with profile/password forms.
- AI: enable configured managed Cloud provider, meter all operator-funded Cloud generations, enforce per-Organization quota under concurrency, and avoid false queued success when drafting is disabled.
- Reply settings: expose existing context and language fields through an Owner-only write API and dialog; isolate Organizations and validate input. Failed reads cannot overwrite settings with defaults.
- Measurement: `pnpm report:acquisition --from YYYY-MM-DD --to YYYY-MM-DD` produces an aggregate Organization-cohort report from persisted records. It does not infer visits, return rate, attribution, or successful payment from subscription state. See `docs/acquisition-measurement.md`.

## SEO and content changes

- Clear App Store / Google Play positioning, consistent canonicals, social preview images, functional mobile navigation, and corrected repository/download links.
- Three substantive guides: connect App Store, connect Google Play, and manage both stores; linked from the site and onboarding.
- Pricing explains sync frequency, manual sync limits, and initial-import limits; removes unimplemented overage-pack promises.
- Marketing sitemap contains eight indexable URLs (five before); the build also emits a 404 page. Each index page has one H1, one canonical, and no broken internal page links in the generated output checked locally.
- Authenticated SPA is explicitly `noindex`; its robots file allows crawling so crawlers can read that directive. The marketing site remains indexable.

## Browser regression evidence

An isolated local database and synthetic User/App/Review were used; no real store credentials or external publication.

1. Original HEAD with autosync enabled: new login stalled on “Loading Reviews”; usage returned 403 before an Organization was active and Angular threw ResourceValueError. Reload displayed the seeded review.
2. Apply only the shell activation fix: sign out and sign in again. “Opening your Organization” transitions to the seeded review without reload; no console errors.
3. Integrated product: disabled AI shows an unavailable message and offers manual writing; reply settings save and reload through the API; mobile marketing navigation expands at 390 px.

The repository has no browser test runner for the Angular app. This regression was exercised in the browser, not represented as an automated Angular unit test.

## Verification

Formatting, lint, all-project typecheck and build pass. The combined Vitest suite passes 98 tests across 23 files. The acquisition report tests are also registered as an Nx target.

Local SMTP/API verification covers unknown-address generic response, captured reset email, invalid token, successful reset, rejected token reuse, rejected old password, accepted new password, and session revocation. No email was sent externally.

A real PostgreSQL concurrency test with two Cloud jobs and quota 1 produced one provider call, one draft and one usage event; the second job observed the limit. Provider failure records no usage, and SQL failure rolls back. Provider calls are bounded to 60 seconds without implicit retries; the per-Organization lock serializes Cloud draft generation during that call.

## Operational follow-up

Deploy the validated changes, configure and verify SMTP and the Cloud AI provider/worker, and test store import/publication and Stripe events in their intended environments. Local tests cannot establish those production facts.

Search Console index inspection/submission, an evidenced Bibliocards case study, outside-user trials, outreach and channel attribution remain acquisition work. No customer results, legal/operator details or production credentials have been invented; no outreach was sent. The original audit is a dated baseline, not a description of the corrected working tree.
