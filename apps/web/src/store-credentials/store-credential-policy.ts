export type StoreCredentialInputValidationResult =
  | { ok: true; credentialMaterial: string }
  | { ok: false; message: string }

const MAX_STORE_CREDENTIAL_MATERIAL_LENGTH = 20_000

export function canManageStoreCredential(input: { memberRole: string }): boolean {
  return input.memberRole === "owner" || input.memberRole === "admin"
}

export function validateStoreCredentialInput(input: {
  credentialMaterial: unknown
}): StoreCredentialInputValidationResult {
  const credentialMaterial = String(input.credentialMaterial ?? "")

  if (credentialMaterial.trim().length === 0) {
    return { ok: false, message: "Store Credential material is required." }
  }

  if (credentialMaterial.length > MAX_STORE_CREDENTIAL_MATERIAL_LENGTH) {
    return { ok: false, message: "Store Credential material must be 20,000 characters or fewer." }
  }

  return { ok: true, credentialMaterial }
}
