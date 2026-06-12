import { parseDeploymentModeFromEnvironment } from "@reviewinbox/config"
import { count, createDatabase, eq, schema, sql } from "@reviewinbox/db"
import { createFileRoute } from "@tanstack/react-router"

import { firstOwnerOnboardingAuth } from "../../../auth/server.js"
import { canCreateFirstOwner } from "../../../onboarding/first-owner-policy.js"

const FIRST_OWNER_LOCK_ID = 7_309_001
const DEFAULT_ORGANIZATION_ID = "default"
const DEFAULT_ORGANIZATION_SLUG = "default"
const DEFAULT_ORGANIZATION_NAME = "Default Organization"

const db = createDatabase()

export const Route = createFileRoute("/api/onboarding/first-owner")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        if (!isSameOriginRequest(request)) {
          return new Response("First Owner onboarding only accepts same-origin requests.", {
            status: 403,
          })
        }

        const form = await request.formData()
        const name = String(form.get("name") ?? "").trim()
        const email = String(form.get("email") ?? "")
          .trim()
          .toLowerCase()
        const password = String(form.get("password") ?? "")

        if (!isValidInput({ name, email, password })) {
          return new Response("Name, email, and an 8 character password are required.", {
            status: 400,
          })
        }

        const mode = parseDeploymentModeFromEnvironment(process.env)

        try {
          await db.transaction(async (tx) => {
            await tx.execute(sql`select pg_advisory_xact_lock(${FIRST_OWNER_LOCK_ID})`)

            const userCount = await countUsers(tx)
            const ownerCount = await countOwners(tx)
            if (!canCreateFirstOwner({ mode, ownerCount, userCount })) {
              throw new FirstOwnerOnboardingClosedError()
            }

            const userId =
              userCount === 0
                ? await signUpFirstOwner({ email, name, password })
                : await signInRecoverableFirstOwner({ email, password })

            const userCountAfterSignup = await countUsers(tx)
            if (userCountAfterSignup !== 1) {
              throw new Error("First Owner creation did not leave exactly one user.")
            }

            await tx
              .insert(schema.organization)
              .values({
                id: DEFAULT_ORGANIZATION_ID,
                name: DEFAULT_ORGANIZATION_NAME,
                slug: DEFAULT_ORGANIZATION_SLUG,
              })
              .onConflictDoNothing()

            await tx
              .insert(schema.member)
              .values({
                id: crypto.randomUUID(),
                organizationId: DEFAULT_ORGANIZATION_ID,
                userId,
                role: "owner",
              })
              .onConflictDoNothing()

            await tx
              .update(schema.session)
              .set({ activeOrganizationId: DEFAULT_ORGANIZATION_ID })
              .where(eq(schema.session.userId, userId))
          })
        } catch (error) {
          if (error instanceof FirstOwnerOnboardingClosedError) {
            return new Response("First Owner onboarding is closed for this Deployment Mode.", {
              status: 403,
            })
          }

          throw error
        }

        return Response.redirect(new URL("/", request.url), 303)
      },
    },
  },
})

async function countUsers(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<number> {
  const [row] = await tx.select({ value: count() }).from(schema.user)

  return row?.value ?? 0
}

class FirstOwnerOnboardingClosedError extends Error {}

async function countOwners(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<number> {
  const [row] = await tx
    .select({ value: count() })
    .from(schema.member)
    .where(eq(schema.member.role, "owner"))

  return row?.value ?? 0
}

async function signUpFirstOwner(input: {
  email: string
  name: string
  password: string
}): Promise<string> {
  const signup = await firstOwnerOnboardingAuth.api.signUpEmail({
    body: input,
  })

  return signup.user.id
}

async function signInRecoverableFirstOwner(input: {
  email: string
  password: string
}): Promise<string> {
  const signin = await firstOwnerOnboardingAuth.api.signInEmail({
    body: input,
  })

  return signin.user.id
}

function isSameOriginRequest(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return false
  }

  const origin = request.headers.get("origin")
  if (!origin) {
    return false
  }

  return origin === new URL(process.env.BETTER_AUTH_URL ?? request.url).origin
}

function isValidInput(input: { name: string; email: string; password: string }): boolean {
  return (
    input.name.length > 0 &&
    input.name.length <= 100 &&
    input.email.length > 0 &&
    input.email.length <= 254 &&
    input.password.length >= 8 &&
    input.password.length <= 128
  )
}
