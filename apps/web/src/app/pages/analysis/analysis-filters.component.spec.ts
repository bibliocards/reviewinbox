import { describe, expect, it } from 'vitest'

import { formatAnalysisDate, parseAnalysisDate } from './analysis-date-filter'

describe('analysis date filter conversion', () => {
  it('round trips a local calendar date without applying a UTC offset', () => {
    const value = parseAnalysisDate('2024-03-31')

    expect(value).not.toBeNull()
    expect(formatAnalysisDate(value)).toBe('2024-03-31')
    expect(value?.getFullYear()).toBe(2024)
    expect(value?.getMonth()).toBe(2)
    expect(value?.getDate()).toBe(31)
  })

  it('returns an empty value for cleared or invalid dates', () => {
    expect(formatAnalysisDate(null)).toBe('')
    expect(parseAnalysisDate('2024-02-30')).toBeNull()
    expect(parseAnalysisDate('2024-2-3')).toBeNull()
  })
})
