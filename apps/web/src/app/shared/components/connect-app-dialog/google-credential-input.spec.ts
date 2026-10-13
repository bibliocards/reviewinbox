import { describe, expect, it } from 'vitest'

import { googleCredentialError, maxCredentialFileSize } from './google-credential-input'

describe('Google Play credential input', () => {
  it('accepts a complete JSON file with additional service account fields', () => {
    expect(
      googleCredentialError(
        JSON.stringify({
          client_email: 'service@example.com',
          private_key: 'private material',
          type: 'service_account',
        }),
      ),
    ).toBeNull()
  })
  it('rejects malformed JSON, non-object input and missing credential fields without exposing input', () => {
    expect(googleCredentialError('private material')).toBe(
      'apps.connectDialog.errors.googleCredentialInvalidJson',
    )
    for (const value of [
      null,
      [],
      { client_email: 'service@example.com' },
      { client_email: 'service@example.com', private_key: '' },
    ]) {
      expect(googleCredentialError(JSON.stringify(value))).toBe(
        'apps.connectDialog.errors.googleCredentialInvalidFormat',
      )
    }
  })
  it('rejects input larger than the existing credential contract permits', () => {
    expect(googleCredentialError('x'.repeat(maxCredentialFileSize + 1))).toBe(
      'apps.connectDialog.errors.credentialTooLarge',
    )
  })
})
