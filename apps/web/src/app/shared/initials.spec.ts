import { describe, expect, it } from 'vitest'

import { initialsFrom } from './initials'

describe('initialsFrom', () => {
  it.each([
    { name: undefined, expected: '' },
    { name: '', expected: '' },
    { name: '   ', expected: '' },
    { name: 'reviewinbox', expected: 'R' },
    { name: 'Thomas Orgeval', expected: 'TO' },
    { name: '  Thomas   Orgeval  ', expected: 'TO' },
    { name: 'one two three', expected: 'OT' },
    { name: 'éloïse été', expected: 'ÉÉ' },
    { name: 'review-inbox.app', expected: 'R' },
    { name: 'one\ttwo', expected: 'O' },
    { name: 'one\ntwo', expected: 'O' },
  ])('returns "$expected" for "$name"', ({ name, expected }) => {
    expect(initialsFrom(name)).toBe(expected)
  })
})
