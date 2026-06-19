const defaultErrorKey = 'errors.generic'

const betterAuthErrorKeys: Record<string, string> = {
  USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION: 'organization.members.errors.alreadyMember',
}

export function betterAuthErrorKey(error: unknown, fallback = defaultErrorKey): string {
  const code = betterAuthErrorCode(error)

  return code ? (betterAuthErrorKeys[code] ?? fallback) : fallback
}

function betterAuthErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined
  }

  const record = error as Record<string, unknown>
  const code = record['code']

  if (typeof code === 'string') {
    return code
  }

  const body = record['body']

  if (body && typeof body === 'object') {
    const bodyCode = (body as Record<string, unknown>)['code']

    if (typeof bodyCode === 'string') {
      return bodyCode
    }
  }

  const errorValue = record['error']

  if (errorValue && typeof errorValue === 'object') {
    const errorCode = (errorValue as Record<string, unknown>)['code']

    if (typeof errorCode === 'string') {
      return errorCode
    }
  }

  return undefined
}
