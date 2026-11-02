import { afterEach, describe, expect, it, vi } from 'vitest'

import { AcquisitionService } from './acquisition.service'

afterEach(() => vi.unstubAllGlobals())

function sessionStorageFixture(values: Map<string, string>) {
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  }
}

describe('session signup attribution', () => {
  it('preserves the first visit across app navigation and clears it after registration', () => {
    const values = new Map<string, string>()
    vi.stubGlobal('sessionStorage', sessionStorageFixture(values))
    vi.stubGlobal('window', {
      location: {
        href: 'https://cloud.reviewinbox.app/login?ri_source=github&ri_medium=referral&ri_campaign=readme&ri_landing=%2F',
      },
    })
    vi.stubGlobal('document', { referrer: 'https://reviewinbox.app/' })
    const firstVisit = new AcquisitionService()
    expect(firstVisit.attribution).toMatchObject({ source: 'github' })
    vi.stubGlobal('window', { location: { href: 'https://cloud.reviewinbox.app/sign-up' } })
    const service = new AcquisitionService()
    expect(service.attribution).toEqual({
      source: 'github',
      medium: 'referral',
      campaign: 'readme',
      landingPath: '/',
    })
    service.clear()
    expect(service.attribution).toBeNull()
    expect(values.size).toBe(0)
  })

  it('captures the current visit when browser storage is denied', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('Storage denied')
      },
    })
    vi.stubGlobal('window', {
      location: {
        href: 'https://cloud.reviewinbox.app/sign-up?utm_source=github&utm_medium=referral',
      },
    })
    vi.stubGlobal('document', { referrer: '' })
    expect(new AcquisitionService().attribution).toMatchObject({
      source: 'github',
      medium: 'referral',
    })
  })
})
