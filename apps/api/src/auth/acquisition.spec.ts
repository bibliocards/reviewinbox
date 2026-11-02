import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { describe, expect, it } from 'vitest'

import { acquisitionAuthOptions } from './acquisition'

const acquisition = { source: 'google', medium: 'organic', landingPath: '/pricing/' }

type AuthStorage = { user: { acquisition: string }[]; account: object[]; session: object[] }
type SignUpMetadata = typeof acquisition & { arbitrary?: string }

function authCookie(response: Response): string {
  return response.headers.get('set-cookie')?.split(';')[0] ?? ''
}

function fixture(mode: 'cloud' | 'self-hosted' = 'cloud') {
  const storage: AuthStorage = { user: [], account: [], session: [] }
  const auth = betterAuth({
    baseURL: 'http://localhost:3000',
    secret: 'acquisition-test-secret-with-more-than-thirty-two-characters',
    database: memoryAdapter(storage),
    emailAndPassword: { enabled: true },
    ...acquisitionAuthOptions(mode),
  })
  const signUp = (metadata: SignUpMetadata | null) =>
    auth.handler(
      new Request('http://localhost:3000/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Developer',
          email: 'dev@example.test',
          password: 'test-password-1234',
          acquisitionAtSignUp: metadata,
        }),
      }),
    )
  return { auth, storage, signUp }
}

describe('signup attribution through Better Auth', () => {
  it('stores validated attribution on creation and omits it from auth responses', async () => {
    const { storage, signUp } = fixture()
    const response = await signUp({ ...acquisition, arbitrary: 'not-stored' })
    expect(response.status).toBe(200)
    // The memory adapter serializes JSON; PostgreSQL uses native JSONB.
    expect(storage.user[0]?.acquisition).toBe(JSON.stringify(acquisition))
    expect(await response.json()).not.toHaveProperty('user.acquisition')
  })

  it.each([
    null,
    { source: 'email@example.test', medium: 'campaign', landingPath: '/?token=secret' },
  ])('keeps signup available with missing or invalid optional attribution', async (metadata) => {
    const { storage, signUp } = fixture()
    const response = await signUp(metadata)
    expect(response.status).toBe(200)
    expect(storage.user[0]?.acquisition).toBe('null')
  })

  it('does not collect attribution in a self-hosted deployment', async () => {
    const { storage, signUp } = fixture('self-hosted')
    expect((await signUp(acquisition)).status).toBe(200)
    expect(storage.user[0]?.acquisition).toBe('null')
  })

  it('does not allow update-user to rewrite the original acquisition', async () => {
    const { auth, storage, signUp } = fixture()
    const response = await signUp(acquisition)
    const cookie = authCookie(response)
    const update = await auth.handler(
      new Request('http://localhost:3000/api/auth/update-user', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie, origin: 'http://localhost:3000' },
        body: JSON.stringify({
          acquisition: { source: 'overwritten', medium: 'campaign', landingPath: '/' },
        }),
      }),
    )
    expect(update.status).toBe(400)
    expect(await update.json()).toMatchObject({ code: 'FIELD_NOT_ALLOWED' })
    expect(storage.user[0]?.acquisition).toBe(JSON.stringify(acquisition))
  })
})
