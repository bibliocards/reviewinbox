import { describe, expect, it } from 'vitest'

import {
  analysisFiltersSchema,
  classificationOverrideSchema,
  saveTopicRequestSchema,
} from './analysis'

const topicId = '11111111-1111-4111-8111-111111111111'

describe('review analysis input contracts', () => {
  it('requires a store for version filtering and rejects reversed periods', () => {
    expect(analysisFiltersSchema.safeParse({ version: '1.0' }).success).toBe(false)
    expect(
      analysisFiltersSchema.safeParse({ provider: 'google_play', version: '1.0' }).success,
    ).toBe(true)
    expect(
      analysisFiltersSchema.safeParse({
        from: '2026-09-20T00:00:00.000Z',
        to: '2026-09-01T00:00:00.000Z',
      }).success,
    ).toBe(false)
  })

  it('compares date instants even when fractional seconds use different precision', () => {
    expect(
      analysisFiltersSchema.safeParse({
        from: '2026-09-20T12:00:00Z',
        to: '2026-09-20T12:00:00.500Z',
      }).success,
    ).toBe(true)
  })

  it('rejects attempts to override tenant scope or model configuration', () => {
    expect(analysisFiltersSchema.safeParse({ organizationId: 'another-org' }).success).toBe(false)
    expect(
      saveTopicRequestSchema.safeParse({
        label: 'Sync',
        description: 'Cross-device sync',
        model: 'other',
      }).success,
    ).toBe(false)
  })

  it('allows an explicitly indeterminate manual classification without invented labels', () => {
    expect(
      classificationOverrideSchema.parse({ topicIds: [], intents: [], severity: null }),
    ).toEqual({ topicIds: [], intents: [], severity: null })
    expect(
      classificationOverrideSchema.safeParse({
        topicIds: [],
        intents: ['angry'],
        severity: 'extreme',
      }).success,
    ).toBe(false)
  })

  it('rejects duplicate assignments in manual corrections', () => {
    expect(
      classificationOverrideSchema.safeParse({
        topicIds: [topicId, topicId],
        intents: [],
        severity: 'minor',
      }).success,
    ).toBe(false)
    expect(
      classificationOverrideSchema.safeParse({
        topicIds: [],
        intents: ['request_help', 'request_help'],
        severity: null,
      }).success,
    ).toBe(false)
  })
})
