import type { GenerateReplyDraftInput, GenerateReplyDraftResult } from '@reviewinbox/ai'
import { AiDraftingError } from '@reviewinbox/ai'
import { canGenerateManagedAiReplyDraft, getMonthlyUsagePeriod } from '@reviewinbox/billing'
import {
  apps,
  type Database,
  organization,
  replyDrafts,
  reviews,
  storeConnections,
  usageEvents,
} from '@reviewinbox/db'
import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm'

export type DraftGenerator = (input: GenerateReplyDraftInput) => Promise<GenerateReplyDraftResult>

export type GenerateReplyDraftForReviewInput = {
  organizationId: string
  reviewId: string
  generateDraft: DraftGenerator
  deploymentMode: 'self-hosted' | 'cloud'
  aiProvider: 'managed' | 'openai-compatible'
} & (
  | { database: Database; transaction?: never }
  | { transaction: ReplyDraftGenerationTransaction; database?: never }
)

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
type DraftableStatus = (typeof draftableStatuses)[number]
const draftableStatusSet: ReadonlySet<string> = new Set(draftableStatuses)

type DatabaseTransaction = Parameters<Parameters<Database['transaction']>[0]>[0]
type DatabaseExecutor = Database | DatabaseTransaction

type DraftReview = Pick<
  typeof reviews.$inferSelect,
  | 'id'
  | 'organizationId'
  | 'appId'
  | 'storeConnectionId'
  | 'replyStatus'
  | 'changedAfterReply'
  | 'body'
  | 'rating'
  | 'title'
  | 'locale'
  | 'language'
>
type DraftApp = Pick<
  typeof apps.$inferSelect,
  'id' | 'autoDraftEnabled' | 'name' | 'replyContext' | 'defaultLanguage' | 'mappedLanguages'
>
type DraftStoreConnection = Pick<typeof storeConnections.$inferSelect, 'id' | 'status' | 'provider'>
type DraftReply = Pick<typeof replyDrafts.$inferSelect, 'id'>
type DraftableReview = {
  review: DraftReview
  app: DraftApp
  storeConnection: DraftStoreConnection
  replyDraft: DraftReply | null
}
type UpdatedReview = Pick<typeof reviews.$inferSelect, 'id' | 'organizationId' | 'appId'>

export type ReplyDraftGenerationTransaction = {
  lockUsagePeriod: (organizationId: string) => Promise<void>
  selectDraftableReview: (
    organizationId: string,
    reviewId: string,
  ) => Promise<DraftableReview | undefined>
  canGenerateCloudAiReplyDraftForOrganization: (
    organizationId: string,
  ) => Promise<{ allowed: boolean }>
  selectLatestDraftableReview: (row: DraftableReview) => Promise<DraftableReview | undefined>
  updateReviewWithDraft: (
    latest: DraftableReview,
    generated: GenerateReplyDraftResult,
  ) => Promise<UpdatedReview | undefined>
  insertGeneratedDraft: (
    updatedReview: UpdatedReview,
    generated: GenerateReplyDraftResult,
  ) => Promise<{ id: string } | undefined>
  recordManagedDraftUsage: (organizationId: string) => Promise<void>
  recordDraftFailure: (organizationId: string, reviewId: string, errorCode: string) => Promise<void>
}

export function generateReplyDraftForReview(
  input: GenerateReplyDraftForReviewInput,
): Promise<GenerateReplyDraftForReviewResult> {
  if (input.transaction) {
    return processDraftGeneration(input.transaction, input)
  }

  return input.database.transaction((transaction) =>
    processDraftGeneration(createReplyDraftGenerationTransaction(transaction), input),
  )
}

async function processDraftGeneration(
  transaction: ReplyDraftGenerationTransaction,
  input: GenerateReplyDraftForReviewInput,
): Promise<GenerateReplyDraftForReviewResult> {
  await lockUsagePeriod(transaction, input)
  const draftableReview = await transaction.selectDraftableReview(
    input.organizationId,
    input.reviewId,
  )

  if (!draftableReview) {
    return { status: 'skipped', reason: 'review_not_found' }
  }

  const skipReason = getSkipReason(draftableReview)
  if (skipReason) {
    return { status: 'skipped', reason: skipReason }
  }

  const quotaSkipReason = await getQuotaSkipReason(transaction, input)
  if (quotaSkipReason) {
    return { status: 'skipped', reason: quotaSkipReason }
  }

  return generateAndStoreDraft(transaction, draftableReview, input)
}

async function lockUsagePeriod(
  transaction: ReplyDraftGenerationTransaction,
  input: GenerateReplyDraftForReviewInput,
): Promise<void> {
  if (shouldMeterAiUsage(input)) {
    await transaction.lockUsagePeriod(input.organizationId)
  }
}

async function getQuotaSkipReason(
  transaction: ReplyDraftGenerationTransaction,
  input: GenerateReplyDraftForReviewInput,
): Promise<'monthly_managed_ai_reply_draft_cap_reached' | null> {
  if (!shouldMeterAiUsage(input)) {
    return null
  }

  const decision = await transaction.canGenerateCloudAiReplyDraftForOrganization(
    input.organizationId,
  )
  return decision.allowed ? null : 'monthly_managed_ai_reply_draft_cap_reached'
}

async function generateAndStoreDraft(
  transaction: ReplyDraftGenerationTransaction,
  draftableReview: DraftableReview,
  input: GenerateReplyDraftForReviewInput,
): Promise<GenerateReplyDraftForReviewResult> {
  let generated: GenerateReplyDraftResult
  try {
    generated = await input.generateDraft(toGenerateDraftInput(draftableReview))
  } catch (error) {
    const errorCode = error instanceof AiDraftingError ? error.code : 'unknown'
    await transaction.recordDraftFailure(input.organizationId, input.reviewId, errorCode)
    return { status: 'failed', errorCode }
  }

  return storeGeneratedDraft(transaction, draftableReview, generated, input)
}

function toGenerateDraftInput(row: DraftableReview): GenerateReplyDraftInput {
  return {
    reviewText: row.review.body,
    reviewRating: row.review.rating,
    reviewTitle: row.review.title,
    appName: row.app.name,
    store: row.storeConnection.provider,
    replyContext: row.app.replyContext,
    defaultLanguage: row.app.defaultLanguage,
    mappedLanguages: row.app.mappedLanguages,
    storeLocale: row.review.locale ?? row.review.language,
  }
}

function createReplyDraftGenerationTransaction(
  database: DatabaseTransaction,
): ReplyDraftGenerationTransaction {
  return {
    lockUsagePeriod: async (organizationId) => {
      await database.execute(sql`select pg_advisory_xact_lock(hashtext(${organizationId}))`)
    },
    selectDraftableReview: (organizationId, reviewId) =>
      selectDraftableReview(database, organizationId, reviewId),
    canGenerateCloudAiReplyDraftForOrganization: (organizationId) =>
      canGenerateCloudAiReplyDraftForOrganization(database, organizationId),
    selectLatestDraftableReview: (row) => selectLatestDraftableReview(database, row),
    updateReviewWithDraft: (latest, generated) =>
      updateReviewWithDraft(database, latest, generated),
    insertGeneratedDraft: (updatedReview, generated) =>
      insertGeneratedDraft(database, updatedReview, generated),
    recordManagedDraftUsage: (organizationId) => recordManagedDraftUsage(database, organizationId),
    recordDraftFailure: (organizationId, reviewId, errorCode) =>
      recordDraftFailure(database, organizationId, reviewId, errorCode),
  }
}

async function selectDraftableReview(
  database: DatabaseExecutor,
  organizationId: string,
  reviewId: string,
) {
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
      and(
        eq(reviews.storeConnectionId, storeConnections.id),
        eq(storeConnections.organizationId, organizationId),
      ),
    )
    .leftJoin(replyDrafts, eq(reviews.id, replyDrafts.reviewId))
    .where(and(eq(reviews.id, reviewId), eq(reviews.organizationId, organizationId)))
    .limit(1)

  return row
}

function getSkipReason(
  row: DraftableReview,
): Extract<GenerateReplyDraftForReviewResult, { status: 'skipped' }>['reason'] | null {
  if (!row.app.autoDraftEnabled) {
    return 'auto_draft_disabled'
  }

  if (row.storeConnection.status !== 'active') {
    return 'store_connection_disabled'
  }

  if (!isDraftableStatus(row.review.replyStatus)) {
    return 'not_draftable'
  }

  if (row.replyDraft && !row.review.changedAfterReply) {
    return 'draft_exists'
  }

  if (!row.review.body.trim()) {
    return 'review_without_text'
  }

  return null
}

function isDraftableStatus(status: string): status is DraftableStatus {
  return draftableStatusSet.has(status)
}

async function storeGeneratedDraft(
  transaction: ReplyDraftGenerationTransaction,
  row: DraftableReview,
  generated: GenerateReplyDraftResult,
  input: Pick<GenerateReplyDraftForReviewInput, 'deploymentMode'>,
): Promise<GenerateReplyDraftForReviewResult> {
  const latest = await transaction.selectLatestDraftableReview(row)

  if (!latest) {
    return { status: 'skipped', reason: 'review_not_found' }
  }

  if (!hasSameReviewContent(row, latest)) {
    return { status: 'skipped', reason: 'not_draftable' }
  }

  return storeLatestGeneratedDraft(transaction, latest, generated, input)
}

function hasSameReviewContent(left: DraftableReview, right: DraftableReview): boolean {
  return (
    left.review.title === right.review.title
    && left.review.body === right.review.body
    && left.review.rating === right.review.rating
  )
}

async function storeLatestGeneratedDraft(
  transaction: ReplyDraftGenerationTransaction,
  latest: DraftableReview,
  generated: GenerateReplyDraftResult,
  input: Pick<GenerateReplyDraftForReviewInput, 'deploymentMode'>,
): Promise<GenerateReplyDraftForReviewResult> {
  const skipReason = getSkipReason(latest)
  if (skipReason) {
    return { status: 'skipped', reason: skipReason }
  }

  const updatedReview = await transaction.updateReviewWithDraft(latest, generated)
  if (!updatedReview) {
    return { status: 'skipped', reason: 'not_draftable' }
  }

  const created = await transaction.insertGeneratedDraft(updatedReview, generated)
  if (!created) {
    return { status: 'skipped', reason: 'draft_exists' }
  }

  if (shouldMeterAiUsage(input)) {
    await transaction.recordManagedDraftUsage(updatedReview.organizationId)
  }
  return { status: 'drafted', replyDraftId: created.id }
}

async function selectLatestDraftableReview(database: DatabaseExecutor, row: DraftableReview) {
  const [latest] = await database
    .select({
      review: reviews,
      app: apps,
      storeConnection: storeConnections,
      replyDraft: replyDrafts,
    })
    .from(reviews)
    .innerJoin(
      apps,
      and(eq(reviews.appId, apps.id), eq(apps.organizationId, row.review.organizationId)),
    )
    .innerJoin(
      storeConnections,
      and(
        eq(reviews.storeConnectionId, storeConnections.id),
        eq(storeConnections.organizationId, row.review.organizationId),
      ),
    )
    .leftJoin(replyDrafts, eq(reviews.id, replyDrafts.reviewId))
    .where(
      and(eq(reviews.id, row.review.id), eq(reviews.organizationId, row.review.organizationId)),
    )
    .for('update', { of: reviews })
    .limit(1)

  return latest
}

async function updateReviewWithDraft(
  database: DatabaseExecutor,
  latest: DraftableReview,
  generated: GenerateReplyDraftResult,
) {
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
        sql`${reviews.title} is not distinct from ${latest.review.title}`,
        sql`${reviews.body} is not distinct from ${latest.review.body}`,
        sql`${reviews.rating} is not distinct from ${latest.review.rating}`,
      ),
    )
    .returning({ id: reviews.id, organizationId: reviews.organizationId, appId: reviews.appId })

  return updatedReview
}

async function insertGeneratedDraft(
  database: DatabaseExecutor,
  updatedReview: { id: string; organizationId: string; appId: string },
  generated: GenerateReplyDraftResult,
) {
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
    .onConflictDoUpdate({
      target: replyDrafts.reviewId,
      set: {
        draftText: generated.draftText,
        detectedReviewLanguage: generated.detectedReviewLanguage,
        chosenReplyLanguage: generated.chosenReplyLanguage,
        model: generated.model,
        promptVersion: generated.promptVersion,
        updatedAt: new Date(),
      },
    })
    .returning({ id: replyDrafts.id })

  return created
}

async function recordManagedDraftUsage(
  database: DatabaseExecutor,
  organizationId: string,
): Promise<void> {
  await database
    .insert(usageEvents)
    .values({
      organizationId,
      type: 'managed_ai_reply_draft_generated',
      quantity: 1,
      occurredAt: new Date(),
    })
}

function shouldMeterAiUsage(
  input: Pick<GenerateReplyDraftForReviewInput, 'deploymentMode'>,
): boolean {
  return input.deploymentMode === 'cloud'
}

async function canGenerateCloudAiReplyDraftForOrganization(
  database: DatabaseExecutor,
  organizationId: string,
) {
  const billingOrganization = await database.query.organization.findFirst({
    columns: { planName: true, billingOverrides: true },
    where: eq(organization.id, organizationId),
  })
  if (!billingOrganization) {
    return {
      allowed: false as const,
      reason: 'monthly_managed_ai_reply_draft_cap_reached' as const,
      remaining: 0 as const,
    }
  }

  const usagePeriod = getMonthlyUsagePeriod()
  const [monthlyManagedAiReplyDrafts] = await database
    .select({ quantity: sql<number>`coalesce(sum(${usageEvents.quantity}), 0)::int` })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.organizationId, organizationId),
        eq(usageEvents.type, 'managed_ai_reply_draft_generated'),
        gte(usageEvents.occurredAt, usagePeriod.startsAt),
        lt(usageEvents.occurredAt, usagePeriod.endsAt),
      ),
    )
    .limit(1)

  return canGenerateManagedAiReplyDraft(
    {
      deploymentMode: 'cloud',
      planName: billingOrganization.planName,
      overrides: billingOrganization.billingOverrides,
    },
    monthlyManagedAiReplyDrafts?.quantity ?? 0,
  )
}

async function recordDraftFailure(
  database: DatabaseExecutor,
  organizationId: string,
  reviewId: string,
  errorCode: string,
): Promise<void> {
  await database
    .update(reviews)
    .set({
      replyStatus: 'failed',
      draftFailureCode: toDraftFailureCode(errorCode),
      draftFailureAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(reviews.id, reviewId),
        eq(reviews.organizationId, organizationId),
        inArray(reviews.replyStatus, [...draftableStatuses]),
      ),
    )
}

function toDraftFailureCode(errorCode: string) {
  if (
    errorCode === 'provider_unavailable'
    || errorCode === 'provider_rate_limited'
    || errorCode === 'invalid_provider_config'
    || errorCode === 'safety_rejected'
    || errorCode === 'context_too_large'
    || errorCode === 'invalid_model_output'
  ) {
    return errorCode
  }

  return 'unknown'
}
