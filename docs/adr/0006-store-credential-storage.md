# Store credential storage

ReviewInbox stores Apple App Store and Google Play credentials per store connection in Postgres as application-encrypted credential blobs, using a deployment-provided `APP_ENCRYPTION_KEY`. Credentials cannot live only in environment variables because ReviewInbox must support multiple apps and store connections in both self-hosted and cloud deployments.

## Consequences

Credential records must store only ciphertext and crypto metadata such as algorithm, nonce, version, and key identifier. ReviewInbox must use authenticated encryption with a random nonce per encryption, fail startup on missing or weak production encryption keys, redact credential material from logs and errors, decrypt only at point of use, and preserve a path for future key rotation or envelope encryption.
