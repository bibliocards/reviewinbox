import {
  createOpenAiCompatibleReplyDraftProvider,
  generateReplyDraft,
  type OpenAiCompatibleReplyDraftProviderOptions,
} from '@reviewinbox/ai'
import { loadAiConfig } from '@reviewinbox/config'
import {
  regenerateReplyDraftRequestSchema,
  regenerateReplyDraftResponseSchema,
  type ReplyDraftAdjustment,
  type RegenerateReplyDraftRequest,
} from '@reviewinbox/contracts'
import { type Database, reviews } from '@reviewinbox/db'
import {
  generateReplyDraftForReview,
  type DraftGenerator,
  type GenerateReplyDraftForReviewResult,
} from '@reviewinbox/reply-drafts'
import { and, eq } from 'drizzle-orm'
import type { Context } from 'hono'

import type { requireActiveOrganizationSession } from '../auth/session'
import { parseJsonBody, parseUuidParam } from '../http/validation'
import { isReviewContentTokenCurrent } from '../review-content'

type RegenerationRuntime = {
  deploymentMode: 'cloud' | 'self-hosted'
  aiProvider: 'managed' | 'openai-compatible'
  generateDraft: DraftGenerator
}

type RegenerationDependencies = {
  database: Database
  requireSession: typeof requireActiveOrganizationSession
  getRuntime?: () => RegenerationRuntime | null
}

const adjustmentInstructions: Record<ReplyDraftAdjustment, string> = {
  shorter: 'Make the reply shorter.',
  warmer: 'Use a warmer, empathetic tone.',
  more_direct: 'Be more direct and specific.',
  less_promotional: 'Remove promotional or sales language.',
}

export function createRegenerateReplyDraftHandler(dependencies: RegenerationDependencies) {
  return async (context: Context) => {
    const sessionResult = await dependencies.requireSession(context)
    if (!sessionResult.ok) {
      return sessionResult.response
    }

    const organizationId = sessionResult.session.organizationId
    const request = await parseRegenerationRequest(context, dependencies.database, organizationId)
    if (!request.ok) {
      return request.response
    }

    const runtime = (dependencies.getRuntime ?? getRegenerationRuntime)()
    if (!runtime) {
      return context.json(
        { error: 'AI drafting is unavailable.', errorCode: 'provider_unavailable' },
        503,
      )
    }

    const result = await generateReplyDraftForReview({
      database: dependencies.database,
      organizationId,
      reviewId: request.review.id,
      ...runtime,
      regeneration: buildRegenerationInput(request.body, request.review),
    })

    return regenerationResponse(context, result)
  }
}

async function parseRegenerationRequest(
  context: Context,
  database: Database,
  organizationId: string,
) {
  const reviewIdResult = parseUuidParam(context, 'reviewId', 'Review')
  if (!reviewIdResult.ok) {
    return reviewIdResult
  }
  const body = await parseJsonBody(context, regenerateReplyDraftRequestSchema)
  if (!body.ok) {
    return body
  }
  const review = await database.query.reviews.findFirst({
    where: and(eq(reviews.id, reviewIdResult.data), eq(reviews.organizationId, organizationId)),
  })
  if (!review) {
    return { ok: false as const, response: context.json({ error: 'Review not found.' }, 404) }
  }
  if (!isReviewContentTokenCurrent(body.data.reviewContentToken, review)) {
    return {
      ok: false as const,
      response: context.json({ error: 'Review has changed.', errorCode: 'review_changed' }, 409),
    }
  }
  return { ok: true as const, review, body: body.data }
}

function buildRegenerationInput(
  body: RegenerateReplyDraftRequest,
  review: typeof reviews.$inferSelect,
) {
  return {
    draftText: body.draftText,
    instructions: [
      ...body.adjustments.map((adjustment) => adjustmentInstructions[adjustment]),
      body.instructions,
    ]
      .filter(Boolean)
      .join('\n'),
    reviewContent: { title: review.title, body: review.body, rating: review.rating },
  }
}

function regenerationResponse(context: Context, result: GenerateReplyDraftForReviewResult) {
  if (result.status === 'proposed') {
    return context.json(regenerateReplyDraftResponseSchema.parse({ draftText: result.draftText }))
  }
  if (result.status === 'failed') {
    return context.json(
      { error: 'Could not regenerate the Reply Draft.', errorCode: result.errorCode },
      503,
    )
  }
  if (result.status === 'skipped') {
    return context.json(
      { error: 'Reply Draft regeneration is unavailable.', errorCode: result.reason },
      skipStatus(result.reason),
    )
  }
  return context.json({ error: 'Could not regenerate the Reply Draft.' }, 503)
}

function skipStatus(
  reason: Extract<GenerateReplyDraftForReviewResult, { status: 'skipped' }>['reason'],
) {
  if (reason === 'review_not_found') {
    return 404
  }
  return reason === 'monthly_managed_ai_reply_draft_cap_reached' ? 429 : 409
}

function getRegenerationRuntime(): RegenerationRuntime | null {
  try {
    const config = loadAiConfig()
    if (
      config.provider === 'disabled'
      || config.apiKey === undefined
      || config.model === undefined
    ) {
      return null
    }
    const options: OpenAiCompatibleReplyDraftProviderOptions = {
      apiKey: config.apiKey,
      model: config.model,
    }
    if (config.baseUrl !== undefined) {
      options.baseUrl = config.baseUrl
    }
    const provider = createOpenAiCompatibleReplyDraftProvider(options)
    return {
      deploymentMode: config.deploymentMode,
      aiProvider: config.provider,
      generateDraft: (input) => generateReplyDraft(input, { provider }),
    }
  } catch {
    return null
  }
}
