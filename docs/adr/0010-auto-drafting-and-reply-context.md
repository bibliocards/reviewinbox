# Auto drafting and reply context

ReviewInbox generates reply drafts automatically for newly imported reviews by default, with the behavior configurable per app. Each app can define a simple Markdown reply context and a reply language policy using `defaultLanguage` plus `mappedLanguages`, where drafts use the review language only if it is listed and otherwise fall back to the default language.

## Consequences

For an app that supports French and English replies only, `defaultLanguage` can be `en` and `mappedLanguages` can include `fr`, so French reviews receive French drafts and all other detected languages receive English drafts. Structured context entries with versions, tags, or active dates are deferred until the Markdown field becomes insufficient.

Because store reviews and reply context are untrusted AI inputs, drafting must stay inside the security boundary defined in [0013 AI drafting security boundary](0013-ai-drafting-security-boundary.md).
