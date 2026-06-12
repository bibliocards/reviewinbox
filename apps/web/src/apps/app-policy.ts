export type AppNameValidationResult = { ok: true; name: string } | { ok: false; message: string }

export function validateAppName(value: unknown): AppNameValidationResult {
  const name = String(value ?? "").trim()

  if (name.length === 0) {
    return { ok: false, message: "App name is required." }
  }

  if (name.length > 100) {
    return { ok: false, message: "App name must be 100 characters or fewer." }
  }

  return { ok: true, name }
}

export function hasVerifiedOrganizationMembership(input: {
  activeOrganizationId: string | null | undefined
  memberOrganizationId: string | null | undefined
}): boolean {
  return (
    typeof input.activeOrganizationId === "string" &&
    input.activeOrganizationId.length > 0 &&
    input.memberOrganizationId === input.activeOrganizationId
  )
}

export function canCreateApp(input: { memberRole: string }): boolean {
  return input.memberRole === "owner" || input.memberRole === "admin"
}
