import { z } from 'zod'

export const maxCredentialFileSize = 64 * 1024
const serviceAccountSchema = z.object({
  client_email: z.string().min(1),
  private_key: z.string().min(1),
})

export function googleCredentialError(text: string): string | null {
  if (text.length > maxCredentialFileSize) {
    return 'apps.connectDialog.errors.credentialTooLarge'
  }
  try {
    const value: unknown = JSON.parse(text)
    return serviceAccountSchema.safeParse(value).success
      ? null
      : 'apps.connectDialog.errors.googleCredentialInvalidFormat'
  } catch {
    return 'apps.connectDialog.errors.googleCredentialInvalidJson'
  }
}
