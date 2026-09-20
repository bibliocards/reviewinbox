import { z } from 'zod'

const defaultErrorKey = 'errors.generic'

const betterAuthErrorKeys = {
  USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION: 'organization.members.errors.alreadyMember',
} satisfies Record<string, string>

const betterAuthErrorEnvelopeSchema = z.object({
  code: z.unknown().optional(),
  body: z.unknown().optional(),
  error: z.unknown().optional(),
})
const betterAuthErrorCodeSchema = z.object({ code: z.string().optional() })
type BetterAuthErrorInput = Parameters<typeof betterAuthErrorEnvelopeSchema.safeParse>[0]
type BetterAuthErrorCodeInput = Parameters<typeof betterAuthErrorCodeSchema.safeParse>[0]

export function betterAuthErrorKey(
  error: BetterAuthErrorInput,
  fallback = defaultErrorKey,
): string {
  const code = betterAuthErrorCode(error)

  return code !== undefined && code !== '' && isBetterAuthErrorCode(code)
    ? betterAuthErrorKeys[code]
    : fallback
}

function isBetterAuthErrorCode(value: string): value is keyof typeof betterAuthErrorKeys {
  return Object.hasOwn(betterAuthErrorKeys, value)
}

function betterAuthErrorCode(error: BetterAuthErrorInput): string | undefined {
  const parsed = betterAuthErrorEnvelopeSchema.safeParse(error)
  if (!parsed.success) {
    return undefined
  }

  return (
    readStringCode(parsed.data.code)
    ?? readErrorCode(parsed.data.body)
    ?? readErrorCode(parsed.data.error)
  )
}

function readStringCode(value: BetterAuthErrorCodeInput): string | undefined {
  const parsed = z.string().safeParse(value)
  return parsed.success ? parsed.data : undefined
}

function readErrorCode(value: BetterAuthErrorCodeInput): string | undefined {
  const parsed = betterAuthErrorCodeSchema.safeParse(value)
  return parsed.success ? parsed.data.code : undefined
}
