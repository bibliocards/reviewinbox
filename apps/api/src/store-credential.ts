import type { EncryptedStoreCredential } from '@reviewinbox/core'
import { storeCredentials } from '@reviewinbox/db'
import type { database } from './db'

type DatabaseTransaction = Parameters<Parameters<typeof database.transaction>[0]>[0]

/**
 * Replace the encrypted material while keeping the credential's original
 * creation timestamp as the durable verification fact.
 */
export async function replaceStoreCredential(
  transaction: DatabaseTransaction,
  storeConnectionId: string,
  encrypted: EncryptedStoreCredential,
) {
  const [credential] = await transaction
    .insert(storeCredentials)
    .values({
      storeConnectionId,
      ...encrypted,
    })
    .onConflictDoUpdate({
      target: storeCredentials.storeConnectionId,
      set: { ...encrypted, updatedAt: new Date() },
    })
    .returning()

  if (!credential) {
    throw new Error('Store Credential replacement did not return a row.')
  }

  return credential
}
