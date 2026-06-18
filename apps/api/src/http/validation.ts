import type { Context } from "hono"
import type { z } from "zod"
import { z as zod } from "zod"

const uuidParamSchema = zod.uuid()

export async function parseJsonBody<TSchema extends z.ZodType>(context: Context, schema: TSchema) {
  let body: unknown

  try {
    body = await context.req.json()
  } catch {
    return { ok: false as const, response: context.json({ error: "Invalid JSON body." }, 400) }
  }

  const result = schema.safeParse(body)
  if (!result.success) {
    return {
      ok: false as const,
      response: context.json(
        {
          error: "Invalid request body.",
          issues: result.error.issues.map((issue) => ({
            path: issue.path,
            message: issue.message,
          })),
        },
        400,
      ),
    }
  }

  return { ok: true as const, data: result.data as z.infer<TSchema> }
}

export function parseUuidParam(context: Context, name: string, label: string) {
  const result = uuidParamSchema.safeParse(context.req.param(name))

  if (!result.success) {
    return { ok: false as const, response: context.json({ error: `${label} not found.` }, 404) }
  }

  return { ok: true as const, data: result.data }
}
