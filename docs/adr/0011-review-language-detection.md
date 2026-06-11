# Review language detection

ReviewInbox stores a detected language on each review. V1 derives it from the store locale when reliable, otherwise from the reply draft generation call rather than running a separate language-detection job.

## Consequences

Reply draft generation should return both the detected review language and the chosen reply language. A dedicated language detection library or model call can be added later if store locales and draft-generation detection are not accurate enough.
