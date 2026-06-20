import { describe, expect, it } from 'vitest'

import { chooseReplyLanguage } from './language-policy'

describe('chooseReplyLanguage', () => {
  it('uses the default language when no review language is detected', () => {
    expect(chooseReplyLanguage({ defaultLanguage: 'en', mappedLanguages: ['fr'] }, null)).toBe('en')
  })

  it('treats defaultLanguage as implicitly allowed', () => {
    expect(chooseReplyLanguage({ defaultLanguage: 'en', mappedLanguages: ['fr'] }, 'en')).toBe('en')
  })

  it('uses mapped review language when allowed', () => {
    expect(chooseReplyLanguage({ defaultLanguage: 'en', mappedLanguages: ['fr'] }, 'fr')).toBe('fr')
  })

  it('falls back to default language when detected language is not mapped', () => {
    expect(chooseReplyLanguage({ defaultLanguage: 'en', mappedLanguages: ['fr'] }, 'de')).toBe('en')
  })
})
