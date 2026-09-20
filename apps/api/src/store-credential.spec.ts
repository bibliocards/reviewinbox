import { describe, expect, it, vi } from 'vitest'

import { storeCredentials } from '@reviewinbox/db'

import { replaceStoreCredential } from './store-credential'

describe('replaceStoreCredential', () => {
  it('upserts encrypted material without replacing the credential row', async () => {
    const credential = {
      id: 'credential-id',
      storeConnectionId: 'connection-id',
      ciphertext: 'new-ciphertext',
      nonce: 'new-nonce',
      authTag: 'new-auth-tag',
      algorithm: 'aes-256-gcm',
      version: 1,
      keyId: 'new-key-id',
      createdAt: new Date('2026-09-20T10:00:00.000Z'),
      updatedAt: new Date('2026-09-20T11:00:00.000Z'),
    }
    const returning = vi.fn().mockResolvedValue([credential])
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning })
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate })
    const insert = vi.fn().mockReturnValue({ values })
    const transaction = { insert } as never
    const encrypted = {
      ciphertext: 'new-ciphertext',
      nonce: 'new-nonce',
      authTag: 'new-auth-tag',
      algorithm: 'aes-256-gcm' as const,
      version: 1 as const,
      keyId: 'new-key-id',
    }

    await expect(replaceStoreCredential(transaction, 'connection-id', encrypted)).resolves.toEqual(credential)

    expect(insert).toHaveBeenCalledWith(storeCredentials)
    expect(values).toHaveBeenCalledWith({ storeConnectionId: 'connection-id', ...encrypted })
    expect(onConflictDoUpdate).toHaveBeenCalledWith({
      target: storeCredentials.storeConnectionId,
      set: { ...encrypted, updatedAt: expect.any(Date) },
    })
    expect(onConflictDoUpdate.mock.calls[0]?.[0].set).not.toHaveProperty('createdAt')
  })
})
