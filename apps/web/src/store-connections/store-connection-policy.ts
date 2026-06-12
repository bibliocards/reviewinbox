export const STORE_CONNECTION_STORES = ["apple_app_store", "google_play"] as const

export type StoreConnectionStore = (typeof STORE_CONNECTION_STORES)[number]

export type StoreConnectionInputValidationResult =
  | {
      ok: true
      store: StoreConnectionStore
      externalAppId: string
      displayName: string | null
      syncEnabled: boolean
    }
  | { ok: false; message: string }

export function canCreateStoreConnection(input: { memberRole: string }): boolean {
  return input.memberRole === "owner" || input.memberRole === "admin"
}

export function validateStoreConnectionInput(input: {
  store: unknown
  externalAppId: unknown
  displayName: unknown
  syncEnabled: unknown
}): StoreConnectionInputValidationResult {
  if (!isStoreConnectionStore(input.store)) {
    return { ok: false, message: "Store is required." }
  }

  const externalAppId = String(input.externalAppId ?? "").trim()
  if (externalAppId.length === 0) {
    return { ok: false, message: "External App ID is required." }
  }

  if (externalAppId.length > 200) {
    return { ok: false, message: "External App ID must be 200 characters or fewer." }
  }

  const displayName = String(input.displayName ?? "").trim()
  if (displayName.length > 100) {
    return { ok: false, message: "Display name must be 100 characters or fewer." }
  }

  return {
    ok: true,
    store: input.store,
    externalAppId,
    displayName: displayName.length > 0 ? displayName : null,
    syncEnabled: input.syncEnabled === true || input.syncEnabled === "on",
  }
}

function isStoreConnectionStore(value: unknown): value is StoreConnectionStore {
  return STORE_CONNECTION_STORES.includes(value as StoreConnectionStore)
}
