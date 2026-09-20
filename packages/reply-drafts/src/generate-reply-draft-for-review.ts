import type { GenerateReplyDraftInput, GenerateReplyDraftResult } from '@reviewinbox/ai'
import { AiDraftingError } from '@reviewinbox/ai'
import { canGenerateManagedAiReplyDraft, getMonthlyUsagePeriod } from '@reviewinbox/billing'
import { apps, type Database, organization, replyDrafts, reviews, storeConnections, usageEvents } from '@reviewinbox/db'
import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm'

export type DraftGenerator = (input: GenerateReplyDraftInput) => Promise<GenerateReplyDraftResult>

export type GenerateReplyDraftForReviewInput = {
  database: Database
  organizationId: string
  reviewId: string
  generateDraft: DraftGenerator
  deploymentMode: 'self-hosted' | 'cloud'
  aiProvider: 'managed' | 'openai-compatible'
}

export type GenerateReplyDraftForReviewResult =
  | { status: 'drafted'; replyDraftId: string }
  | { status: 'failed'; errorCode: string }
  | {
      status: 'skipped'
      reason:
        | 'review_not_found'
        | 'auto_draft_disabled'
        | 'review_without_text'
        | 'not_draftable'
        | 'draft_exists'
        | 'store_connection_disabled'
        | 'monthly_managed_ai_reply_draft_cap_reached'
    }

const draftableStatuses = ['pending', 'failed'] as const

type DatabaseTransaction = Parameters<Parameters<Database['transaction']>[0]>[0]
type DatabaseExecutor = Database | DatabaseTransaction

export async function generateReplyDraftForReview(input: GenerateReplyDraftForReviewInput): Promise<GenerateReplyDraftForReviewResult> {
  return input.database.transaction(async (transaction) => {
    if (shouldMeterAiUsage(input)) {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${input.organizationId}))`)
    }

    const draftableReview = await selectDraftableReview(transaction, input.organizationId, input.reviewId)

    if (!draftableReview) {
      return { status: 'skipped', reason: 'review_not_found' }
    }

    const skipReason = getSkipReason(draftableReview)
    if (skipReason) {
      return { status: 'skipped', reason: skipReason }
    }

    if (shouldMeterAiUsage(input)) {
      const decision = await canGenerateCloudAiReplyDraftForOrganization({ ...input, database: transaction })
      if (!decision.allowed) {
        return { status: 'skipped', reason: 'monthly_managed_ai_reply_draft_cap_reached' }
      }
    }

    let generated: GenerateReplyDraftResult
    try {
      generated = await input.generateDraft({
        reviewText: draftableReview.review.body,
        reviewRating: draftableReview.review.rating,
        reviewTitle: draftableReview.review.title,
        appName: draftableReview.app.name,
        store: draftableReview.storeConnection.provider,
        replyContext: draftableReview.app.replyContext,
        defaultLanguage: draftableReview.app.defaultLanguage,
        mappedLanguages: draftableReview.app.mappedLanguages,
        storeLocale: draftableReview.review.locale ?? draftableReview.review.language,
      })
    } catch (error) {
      const errorCode = error instanceof AiDraftingError ? error.code : 'unknown'
      await recordDraftFailure(transaction, input.organizationId, input.reviewId, errorCode)
      return { status: 'failed', errorCode }
    }

    return storeGeneratedDraft(transaction, draftableReview, generated, input)
  })
}

async function selectDraftableReview(database: DatabaseExecutor, organizationId: string, reviewId: string) {
  const [row] = await database
    .select({
      review: reviews,
      app: apps,
      storeConnection: storeConnections,
      replyDraft: replyDrafts,
    })
    .from(reviews)
    .innerJoin(apps, and(eq(reviews.appId, apps.id), eq(apps.organizationId, organizationId)))
    .innerJoin(
      storeConnections,
      and(eq(reviews.storeConnectionId, storeConnections.id), eq(storeConnections.organizationId, organizationId)),
    )
    .leftJoin(replyDrafts, eq(reviews.id, replyDrafts.reviewId))
    .where(and(eq(reviews.id, reviewId), eq(reviews.organizationId, organizationId)))
    .limit(1)

  return row
}

type DraftableReview = NonNullable<Awaited<ReturnType<typeof selectDraftableReview>>>

function getSkipReason(row: DraftableReview): Extract<GenerateReplyDraftForReviewResult, { status: 'skipped' }>['reason'] | null {
  if (!row.app.autoDraftEnabled) {
    return 'auto_draft_disabled'
  }

  if (row.storeConnection.status !== 'active') {
    return 'store_connection_disabled'
  }

  if (!draftableStatuses.includes(row.review.replyStatus as (typeof draftableStatuses)[number])) {
    return 'not_draftable'
  }

  if (row.replyDraft) {
    return 'draft_exists'
  }

  if (!row.review.body.trim()) {
    return 'review_without_text'
  }

  return null
}

async function storeGeneratedDraft(
  database: DatabaseExecutor,
  row: DraftableReview,
  generated: GenerateReplyDraftResult,
  input: Pick<GenerateReplyDraftForReviewInput, 'deploymentMode'>,
): Promise<GenerateReplyDraftForReviewResult> {
  const [latest] = await database
    .select({
      review: reviews,
      app: apps,
      storeConnection: storeConnections,
      replyDraft: replyDrafts,
    })
    .from(reviews)
    .innerJoin(apps, and(eq(reviews.appId, apps.id), eq(apps.organizationId, row.review.organizationId)))
    .innerJoin(
      storeConnections,
      and(eq(reviews.storeConnectionId, storeConnections.id), eq(storeConnections.organizationId, row.review.organizationId)),
    )
    .leftJoin(replyDrafts, eq(reviews.id, replyDrafts.reviewId))
    .where(and(eq(reviews.id, row.review.id), eq(reviews.organizationId, row.review.organizationId)))
    .limit(1)

  if (!latest) {
    return { status: 'skipped', reason: 'review_not_found' }
  }

  const skipReason = getSkipReason(latest)
  if (skipReason) {
    return { status: 'skipped', reason: skipReason }
  }

  const [updatedReview] = await database
    .update(reviews)
    .set({
      replyStatus: 'drafted',
      detectedReviewLanguage: generated.detectedReviewLanguage,
      chosenReplyLanguage: generated.chosenReplyLanguage,
      draftFailureCode: null,
      draftFailureAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(reviews.id, latest.review.id),
        eq(reviews.organizationId, latest.review.organizationId),
        inArray(reviews.replyStatus, [...draftableStatuses]),
      ),
    )
    .returning({
      id: reviews.id,
      organizationId: reviews.organizationId,
      appId: reviews.appId,
    })

  if (!updatedReview) {
    return { status: 'skipped', reason: 'not_draftable' }
  }

  const [created] = await database
    .insert(replyDrafts)
    .values({
      organizationId: updatedReview.organizationId,
      appId: updatedReview.appId,
      reviewId: updatedReview.id,
      draftText: generated.draftText,
      detectedReviewLanguage: generated.detectedReviewLanguage,
      chosenReplyLanguage: generated.chosenReplyLanguage,
      model: generated.model,
      promptVersion: generated.promptVersion,
    })
    .onConflictDoNothing({ target: replyDrafts.reviewId })
    .returning({ id: replyDrafts.id })

  if (!created) {
    return { status: 'skipped', reason: 'draft_exists' }
  }

  if (shouldMeterAiUsage(input)) {
    await database.insert(usageEvents).values({
      organizationId: updatedReview.organizationId,
      type: 'managed_ai_reply_draft_generated',
      quantity: 1,
      occurredAt: new Date(),
    })
  }

  return { status: 'drafted', replyDraftId: created.id }
}

function shouldMeterAiUsage(input: Pick<GenerateReplyDraftForReviewInput, 'deploymentMode'>): boolean {
  return input.deploymentMode === 'cloud'
}

async function canGenerateCloudAiReplyDraftForOrganization(
  input: Omit<GenerateReplyDraftForReviewInput, 'database'> & { database: DatabaseExecutor },
) {
  const billingOrganization = await input.database.query.organization.findFirst({
    columns: { planName: true, billingOverrides: true },
    where: eq(organization.id, input.organizationId),
  })
  if (!billingOrganization) {
    return { allowed: false as const, reason: 'monthly_managed_ai_reply_draft_cap_reached' as const, remaining: 0 as const }
  }

  const usagePeriod = getMonthlyUsagePeriod()
  const [monthlyManagedAiReplyDrafts] = await input.database
    .select({ quantity: sql<number>`coalesce(sum(${usageEvents.quantity}), 0)::int` })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.organizationId, input.organizationId),
        eq(usageEvents.type, 'managed_ai_reply_draft_generated'),
        gte(usageEvents.occurredAt, usagePeriod.startsAt),
        lt(usageEvents.occurredAt, usagePeriod.endsAt),
      ),
    )

  return canGenerateManagedAiReplyDraft(
    {
      deploymentMode: input.deploymentMode,
      planName: billingOrganization.planName,
      overrides: billingOrganization.billingOverrides,
    },
    monthlyManagedAiReplyDrafts?.quantity ?? 0,
  )
}

async function recordDraftFailure(database: DatabaseExecutor, organizationId: string, reviewId: string, errorCode: string): Promise<void> {
  await database
    .update(reviews)
    .set({
      replyStatus: 'failed',
      draftFailureCode: toDraftFailureCode(errorCode),
      draftFailureAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(reviews.id, reviewId), eq(reviews.organizationId, organizationId), inArray(reviews.replyStatus, [...draftableStatuses])))
}

function toDraftFailureCode(errorCode: string) {
  if (
    errorCode === 'provider_unavailable' ||
    errorCode === 'provider_rate_limited' ||
    errorCode === 'invalid_provider_config' ||
    errorCode === 'safety_rejected' ||
    errorCode === 'context_too_large' ||
    errorCode === 'invalid_model_output'
  ) {
    return errorCode
  }

  return 'unknown'
}
