import { generateKeyPairSync } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { syncAppleAppStoreReviews } from './client'

describe('syncAppleAppStoreReviews', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('requests customer reviews from the official App Store Connect API host', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await syncAppleAppStoreReviews({
      appStoreAppId: '123456789',
      credential: {
        issuerId: '00000000-0000-0000-0000-000000000000',
        keyId: 'ABC123DEFG',
        privateKey: createTestPrivateKey(),
      },
      checkpoint: null,
      maxPages: 1,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.appstoreconnect.apple.com/v1/apps/123456789/customerReviews?limit=200',
      expect.any(Object),
    )
  })
})

function createTestPrivateKey() {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  return privateKey.export({ format: 'pem', type: 'pkcs8' }).toString()
}
