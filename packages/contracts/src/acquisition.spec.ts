import { describe, expect, it } from 'vitest'

import {
  acquisitionFromVisit,
  acquisitionSchema,
  parseStoredAcquisition,
  withAcquisition,
} from './acquisition'

describe('acquisition URL contract', () => {
  it('carries the original source and landing page across the Cloud boundary without losing the plan', () => {
    const acquisition = acquisitionFromVisit(
      new URL(
        'https://reviewinbox.app/docs/manage-both-stores/?utm_source=github&utm_medium=referral&utm_campaign=readme',
      ),
      '',
    )
    const target = withAcquisition(
      new URL('https://cloud.reviewinbox.app/sign-up?plan=pro'),
      acquisition,
    )
    expect(target.searchParams.get('plan')).toBe('pro')
    expect(acquisitionFromVisit(target, 'https://reviewinbox.app/')).toEqual({
      source: 'github',
      medium: 'referral',
      campaign: 'readme',
      landingPath: '/docs/manage-both-stores/',
    })
  })

  it('records search provenance without retaining the referrer query or fragment', () => {
    expect(
      acquisitionFromVisit(
        new URL('https://reviewinbox.app/'),
        'https://www.google.fr/search?q=private#secret',
      ),
    ).toEqual({ source: 'google', medium: 'organic', landingPath: '/' })
    expect(
      acquisitionFromVisit(
        new URL('https://cloud.reviewinbox.app/sign-up'),
        'https://chatgpt.com/c/private',
      ),
    ).toMatchObject({ source: 'chatgpt', medium: 'ai' })
  })

  it('ignores arbitrary query values and excludes unknown fields from persisted attribution', () => {
    const result = acquisitionFromVisit(
      new URL(
        'https://reviewinbox.app/?utm_source=user@example.com&utm_campaign=https://private.test/token',
      ),
      'https://github.com/bibliocards/reviewinbox',
    )
    expect(result).toEqual({ source: 'github', medium: 'referral', landingPath: '/' })
    expect(acquisitionSchema.parse({ ...result, email: 'private@example.test' })).toEqual(result)
    expect(acquisitionSchema.safeParse({ ...result, landingPath: '/?token=secret' }).success).toBe(
      false,
    )
  })

  it('distinguishes captured direct visits from unavailable attribution', () => {
    expect(acquisitionFromVisit(new URL('https://reviewinbox.app/'), '')).toMatchObject({
      source: 'direct',
      medium: 'direct',
    })
    expect(parseStoredAcquisition(null)).toBeNull()
    expect(parseStoredAcquisition('{broken')).toBeNull()
    expect(parseStoredAcquisition('{"source":"github"}')).toBeNull()
  })

  it('does not retain private app routes as marketing landing pages', () => {
    expect(
      acquisitionFromVisit(new URL('https://cloud.reviewinbox.app/apps/private-app-id'), ''),
    ).toEqual({ source: 'direct', medium: 'direct', landingPath: '/' })
    expect(
      acquisitionSchema.safeParse({
        source: 'direct',
        medium: 'direct',
        landingPath: '/apps/private-app-id',
      }).success,
    ).toBe(false)
  })
})
