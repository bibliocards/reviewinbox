import { describe, expect, it } from 'vitest'

import { maxLanguageTagLength, maxMappedLanguages, maxReplyContextLength, updateReplySettingsRequestSchema } from './reply-settings'

describe('updateReplySettingsRequestSchema', () => {
  it('trims editable guidance and language values', () => {
    expect(
      updateReplySettingsRequestSchema.parse({
        replyContext: '  Be warm and concise.  ',
        defaultLanguage: ' en ',
        mappedLanguages: [' fr-FR ', 'de'],
      }),
    ).toEqual({
      replyContext: 'Be warm and concise.',
      defaultLanguage: 'en',
      mappedLanguages: ['fr-FR', 'de'],
    })
  })

  it('matches the AI input limits', () => {
    expect(
      updateReplySettingsRequestSchema.safeParse({
        replyContext: 'x'.repeat(maxReplyContextLength),
        defaultLanguage: 'x'.repeat(maxLanguageTagLength),
        mappedLanguages: Array.from({ length: maxMappedLanguages }, () => 'fr'),
      }).success,
    ).toBe(true)

    expect(
      updateReplySettingsRequestSchema.safeParse({
        replyContext: 'x'.repeat(maxReplyContextLength + 1),
        defaultLanguage: 'en',
        mappedLanguages: [],
      }).success,
    ).toBe(false)
    expect(
      updateReplySettingsRequestSchema.safeParse({
        replyContext: '',
        defaultLanguage: 'x'.repeat(maxLanguageTagLength + 1),
        mappedLanguages: [],
      }).success,
    ).toBe(false)
    expect(
      updateReplySettingsRequestSchema.safeParse({
        replyContext: '',
        defaultLanguage: 'en',
        mappedLanguages: Array.from({ length: maxMappedLanguages + 1 }, () => 'fr'),
      }).success,
    ).toBe(false)
  })

  it('rejects unknown fields so guidance cannot smuggle privileged settings', () => {
    expect(
      updateReplySettingsRequestSchema.safeParse({
        replyContext: '',
        defaultLanguage: 'en',
        mappedLanguages: [],
        autoDraftEnabled: false,
      }).success,
    ).toBe(false)
  })
})
