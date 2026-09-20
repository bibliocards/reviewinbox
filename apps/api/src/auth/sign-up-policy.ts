import { invitation, user } from '@reviewinbox/db'
import { and, count, eq, gt } from 'drizzle-orm'
import type { MiddlewareHandler } from 'hono'
import { z } from 'zod'

import { database, serverConfig } from '../db'

const signUpRequestSchema = z.object({
  email: z
    .string()
    .min(1)
    .transform((email) => email.toLowerCase()),
  invitationId: z.string().min(1),
})

type SignUpRequest = z.infer<typeof signUpRequestSchema>
type AuthContext = Parameters<MiddlewareHandler>[0]

export const requireInvitationForSelfHostedSignUp: MiddlewareHandler = async (
  context,
  next,
): Promise<Response | void> => {
  if (shouldBypassSignUpPolicy(context.req.method)) {
    return next()
  }

  if (!(await hasExistingUsers())) {
    return next()
  }

  const signUpRequest = await parseSignUpRequest(context)
  if (signUpRequest === null || !(await hasValidInvitation(signUpRequest))) {
    return denySignUp(context)
  }

  return next()
}

function shouldBypassSignUpPolicy(method: string): boolean {
  return method !== 'POST' || serverConfig.deploymentMode === 'cloud'
}

async function hasExistingUsers(): Promise<boolean> {
  const [result] = await database.select({ count: count() }).from(user)
  return (result?.count ?? 0) > 0
}

async function parseSignUpRequest(context: AuthContext): Promise<SignUpRequest | null> {
  const body: unknown = await context.req.raw
    .clone()
    .json()
    .catch(() => null)
  const result = signUpRequestSchema.safeParse(body)
  return result.success ? result.data : null
}

async function hasValidInvitation(request: SignUpRequest): Promise<boolean> {
  const [existingInvitation] = await database
    .select({ id: invitation.id })
    .from(invitation)
    .where(
      and(
        eq(invitation.id, request.invitationId),
        eq(invitation.email, request.email),
        eq(invitation.status, 'pending'),
        gt(invitation.expiresAt, new Date()),
      ),
    )
    .limit(1)

  return existingInvitation !== undefined
}

function denySignUp(context: AuthContext): Promise<Response> {
  return Promise.resolve(
    context.json({ error: 'Sign-up is only available with a valid invitation.' }, 403),
  )
}
