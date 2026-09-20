import type { EncryptedStoreCredential } from '@reviewinbox/core'
import { storeCredentials } from '@reviewinbox/db'
import { describe, expect, it, vi } from 'vitest'

import { replaceStoreCredential } from './store-credential'

type CredentialTransaction = Parameters<typeof replaceStoreCredential>[0]
type InsertBuilder = ReturnType<CredentialTransaction['insert']>
type Values = InsertBuilder['values']
type ConflictBuilder = ReturnType<Values>
type OnConflictDoUpdate = ConflictBuilder['onConflictDoUpdate']
type Returning = ReturnType<OnConflictDoUpdate>['returning']

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
    const returning = vi.fn<Returning>().mockResolvedValue([credential])
    const onConflictDoUpdate = vi.fn<OnConflictDoUpdate>().mockReturnValue({ returning })
    const values = vi.fn<Values>().mockReturnValue({ onConflictDoUpdate })
    const insert = vi.fn<CredentialTransaction['insert']>().mockReturnValue({ values })
    const transaction = { insert } satisfies CredentialTransaction
    const encrypted = {
      ciphertext: 'new-ciphertext',
      nonce: 'new-nonce',
      authTag: 'new-auth-tag',
      algorithm: 'aes-256-gcm',
      version: 1,
      keyId: 'new-key-id',
    } satisfies EncryptedStoreCredential

    await expect(replaceStoreCredential(transaction, 'connection-id', encrypted)).resolves.toEqual(
      credential,
    )

    expect(insert).toHaveBeenCalledWith(storeCredentials)
    expect(values).toHaveBeenCalledWith({ storeConnectionId: 'connection-id', ...encrypted })
    const conflictConfig = onConflictDoUpdate.mock.calls[0]?.[0]
    expect(conflictConfig?.target).toBe(storeCredentials.storeConnectionId)
    expect(conflictConfig?.set).toMatchObject(encrypted)
    expect(conflictConfig?.set.updatedAt).toBeInstanceOf(Date)
    expect(conflictConfig?.set).not.toHaveProperty('createdAt')
  })
})
