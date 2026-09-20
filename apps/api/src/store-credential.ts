import type { EncryptedStoreCredential } from '@reviewinbox/core'
import { storeCredentials } from '@reviewinbox/db'

type StoreCredentialRow = typeof storeCredentials.$inferSelect
type StoreCredentialInsert = typeof storeCredentials.$inferInsert
type StoreCredentialTransaction = {
  insert: (table: typeof storeCredentials) => {
    values: (values: StoreCredentialInsert) => {
      onConflictDoUpdate: (input: {
        target: typeof storeCredentials.storeConnectionId
        set: Partial<StoreCredentialInsert>
      }) => { returning: () => Promise<StoreCredentialRow[]> }
    }
  }
}

/**
 * Replace the encrypted material while keeping the credential's original
 * creation timestamp as the durable verification fact.
 */
export async function replaceStoreCredential(
  transaction: StoreCredentialTransaction,
  storeConnectionId: string,
  encrypted: EncryptedStoreCredential,
) {
  const [credential] = await transaction
    .insert(storeCredentials)
    .values({ storeConnectionId, ...encrypted })
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
