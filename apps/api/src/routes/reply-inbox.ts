import {
  listReplyInboxResponseSchema,
  listReplyAuditEventsQuerySchema,
  listReplyAuditEventsResponseSchema,
  type ListReplyAuditEventsQuery,
  publishReplyRequestSchema,
  queueReplyDraftResponseSchema,
  replyActionResponseSchema,
  replyAuditEventsResponseSchema,
  replyInboxFilterSchema,
  saveReplyDraftRequestSchema,
  updateReviewIgnoredStatusRequestSchema,
} from '@reviewinbox/contracts'
import {
  apps,
  type Database,
  publishedReplies,
  replyAuditEvents,
  replyDrafts,
  reviews,
  storeConnections,
  storeCredentials,
  usageEvents,
  user,
} from '@reviewinbox/db'
import {
  appleAppStoreReviewAdapter,
  AppleStoreAdapterError,
  googlePlayReviewAdapter,
  GooglePlayStoreAdapterError,
} from '@reviewinbox/store-adapters'
import {
  decryptStoreCredentialPlaintext,
  parseAppleCredentialPlaintext,
  parseGooglePlayCredentialPlaintext,
} from '@reviewinbox/sync'
import { and, count, desc, eq, inArray, sql } from 'drizzle-orm'
import type { Context } from 'hono'
import { Hono } from 'hono'
import { z } from 'zod'

import { requireActiveOrganizationSession } from '../auth/session'
import { database } from '../db'
import { parseJsonBody, parseUuidParam } from '../http/validation'
import { enqueueGenerateReplyDraftJobs } from '../queue'
import { createReviewContentToken, isReviewContentTokenCurrent } from '../review-content'

export const replyInboxRoutes = new Hono()

const appIdQuerySchema = z.uuid().optional()
const defaultLimit = 100
const auditMetadataValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()])
const auditMetadataSchema = z.object({
  mode: auditMetadataValueSchema.optional(),
  errorCode: auditMetadataValueSchema.optional(),
  errorMessage: auditMetadataValueSchema.optional(),
  externalReplyId: auditMetadataValueSchema.optional(),
})

type AuditMetadata = z.infer<typeof auditMetadataSchema>
type AuditMetadataKey = keyof AuditMetadata

type ReplyInboxFilter = z.infer<typeof replyInboxFilterSchema>

type ReplyInboxQuery = { filter: ReplyInboxFilter; appId?: string }

type ReplyInboxQueryResult =
  | { ok: true; data: ReplyInboxQuery }
  | { ok: false; error: string; status: 400 | 404 }

replyInboxRoutes.get('/api/reply-inbox', async (context) => {
  const sessionResult = await requireActiveOrganizationSession(context)
  if (!sessionResult.ok) {
    return sessionResult.response
  }

  const queryResult = parseReplyInboxQuery(context)
  if (!queryResult.ok) {
    return context.json({ error: queryResult.error }, queryResult.status)
  }

  const rows = await selectReplyInboxReviews(sessionResult.session.organizationId, queryResult.data)

  return context.json(listReplyInboxResponseSchema.parse({ reviews: rows }))
})

function parseReplyInboxQuery(context: Context): ReplyInboxQueryResult {
  const filterResult = replyInboxFilterSchema
    .optional()
    .default('actionable')
    .safeParse(context.req.query('filter'))
  if (!filterResult.success) {
    return { ok: false, error: 'Invalid Reply Inbox filter.', status: 400 }
  }

  const appIdResult = appIdQuerySchema.safeParse(optionalQueryValue(context.req.query('appId')))
  if (!appIdResult.success) {
    return { ok: false, error: 'App not found.', status: 404 }
  }

  const data: ReplyInboxQuery = { filter: filterResult.data }
  if (appIdResult.data !== undefined) {
    data.appId = appIdResult.data
  }
  return { ok: true, data }
}

async function selectReplyInboxReviews(organizationId: string, query: ReplyInboxQuery) {
  const rows = await database
    .select({
      review: reviews,
      app: apps,
      storeConnection: storeConnections,
      replyDraft: replyDrafts,
      publishedReply: publishedReplies,
    })
    .from(reviews)
    .innerJoin(apps, eq(reviews.appId, apps.id))
    .innerJoin(storeConnections, eq(reviews.storeConnectionId, storeConnections.id))
    .leftJoin(replyDrafts, eq(reviews.id, replyDrafts.reviewId))
    .leftJoin(publishedReplies, eq(reviews.id, publishedReplies.reviewId))
    .where(and(...replyInboxWhere(organizationId, query)))
    .orderBy(replyInboxStatusSort(), desc(reviews.reviewedAt))
    .limit(defaultLimit)

  const publishFailures = await selectLatestPublishFailures(
    organizationId,
    rows.map((row) => row.review.id),
  )
  const latestPublishFailureByReviewId = new Map(
    publishFailures.map((row) => [row.event.reviewId, row.event]),
  )

  return rows.map((row) =>
    toReplyInboxReview(row, latestPublishFailureByReviewId.get(row.review.id) ?? null),
  )
}

function replyInboxWhere(organizationId: string, query: ReplyInboxQuery) {
  const where = [eq(reviews.organizationId, organizationId)]
  if (query.appId !== undefined) {
    where.push(eq(reviews.appId, query.appId))
  }
  if (query.filter === 'actionable') {
    where.push(inArray(reviews.replyStatus, ['drafted', 'failed', 'pending']))
  } else {
    where.push(eq(reviews.replyStatus, query.filter))
  }
  return where
}

function selectLatestPublishFailures(organizationId: string, reviewIds: string[]) {
  if (reviewIds.length === 0) {
    return []
  }
  return database
    .selectDistinctOn([replyAuditEvents.reviewId], { event: replyAuditEvents })
    .from(replyAuditEvents)
    .where(
      and(
        eq(replyAuditEvents.organizationId, organizationId),
        inArray(replyAuditEvents.reviewId, reviewIds),
        eq(replyAuditEvents.action, 'publish_failed'),
      ),
    )
    .orderBy(replyAuditEvents.reviewId, desc(replyAuditEvents.createdAt))
}

replyInboxRoutes.get('/api/reply-audit-events', async (context) => {
  const sessionResult = await requireActiveOrganizationSession(context)
  if (!sessionResult.ok) {
    return sessionResult.response
  }

  const query = parseReplyAuditEventsQuery(context)
  if (query === null) {
    return context.json({ error: 'Invalid Reply audit filter.' }, 400)
  }

  const response = await selectReplyAuditEvents(sessionResult.session.organizationId, query)
  return context.json(listReplyAuditEventsResponseSchema.parse(response))
})

function parseReplyAuditEventsQuery(context: Context): ListReplyAuditEventsQuery | null {
  const result = listReplyAuditEventsQuerySchema.safeParse({
    page: context.req.query('page'),
    pageSize: context.req.query('pageSize'),
    appId: optionalQueryValue(context.req.query('appId')),
    action: optionalQueryValue(context.req.query('action')),
  })
  return result.success ? result.data : null
}

async function selectReplyAuditEvents(organizationId: string, query: ListReplyAuditEventsQuery) {
  const where = replyAuditEventsWhere(organizationId, query)
  const [totalResult] = await database
    .select({ total: count() })
    .from(replyAuditEvents)
    .where(and(...where))
  const rows = await database
    .select({ event: replyAuditEvents, app: apps, review: reviews, actor: user })
    .from(replyAuditEvents)
    .innerJoin(apps, eq(replyAuditEvents.appId, apps.id))
    .innerJoin(reviews, eq(replyAuditEvents.reviewId, reviews.id))
    .leftJoin(user, eq(replyAuditEvents.actorUserId, user.id))
    .where(and(...where))
    .orderBy(desc(replyAuditEvents.createdAt))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize)

  return {
    events: rows.map((row) => ({
      id: row.event.id,
      reviewId: row.event.reviewId,
      appId: row.event.appId,
      appName: row.app.name,
      reviewTitle: row.review.title,
      reviewAuthorDisplayName: row.review.authorDisplayName,
      actorUserId: row.event.actorUserId,
      actorName: row.actor?.name ?? null,
      actorEmail: row.actor?.email ?? null,
      actorImage: row.actor?.image ?? null,
      action: row.event.action,
      metadata: publicAuditMetadataFromEvent(row.event),
      createdAt: row.event.createdAt.toISOString(),
    })),
    page: query.page,
    pageSize: query.pageSize,
    total: totalResult?.total ?? 0,
  }
}

function replyAuditEventsWhere(organizationId: string, query: ListReplyAuditEventsQuery) {
  const where = [eq(replyAuditEvents.organizationId, organizationId)]
  if (query.appId !== undefined) {
    where.push(eq(replyAuditEvents.appId, query.appId))
  }
  if (query.action !== undefined) {
    where.push(eq(replyAuditEvents.action, query.action))
  }
  return where
}

replyInboxRoutes.get('/api/reply-inbox/:reviewId/audit-events', async (context) => {
  const sessionResult = await requireActiveOrganizationSession(context)
  if (!sessionResult.ok) {
    return sessionResult.response
  }

  const reviewIdResult = parseUuidParam(context, 'reviewId', 'Review')
  if (!reviewIdResult.ok) {
    return reviewIdResult.response
  }

  const events = await database.query.replyAuditEvents.findMany({
    where: and(
      eq(replyAuditEvents.reviewId, reviewIdResult.data),
      eq(replyAuditEvents.organizationId, sessionResult.session.organizationId),
    ),
    orderBy: (table, { desc: orderDesc }) => [orderDesc(table.createdAt)],
  })

  return context.json(
    replyAuditEventsResponseSchema.parse({
      events: events.map((event) => toReplyAuditEvent(event)),
    }),
  )
})

replyInboxRoutes.post('/api/reply-inbox/:reviewId/draft/queue', async (context) => {
  const sessionResult = await requireActiveOrganizationSession(context)
  if (!sessionResult.ok) {
    return sessionResult.response
  }

  const reviewIdResult = parseUuidParam(context, 'reviewId', 'Review')
  if (!reviewIdResult.ok) {
    return reviewIdResult.response
  }

  const review = await selectReviewForDraftQueue(
    sessionResult.session.organizationId,
    reviewIdResult.data,
  )
  const validation = validateDraftQueueReview(review)
  if (!validation.ok) {
    return context.json({ error: validation.error }, validation.status)
  }

  const queuedCount = await enqueueGenerateReplyDraftJobs({
    organizationId: sessionResult.session.organizationId,
    reviewIds: [validation.review.id],
  })
  return context.json(queueReplyDraftResponseSchema.parse({ queued: queuedCount === 1 }))
})

replyInboxRoutes.put('/api/reply-inbox/:reviewId/draft', async (context) => {
  const sessionResult = await requireActiveOrganizationSession(context)
  if (!sessionResult.ok) {
    return sessionResult.response
  }

  const request = await parseSaveDraftRequest(context)
  if (!request.ok) {
    return request.response
  }

  const result = await saveDraftFromRequest({
    organizationId: sessionResult.session.organizationId,
    actorUserId: sessionResult.session.userId,
    reviewId: request.reviewId,
    draftText: request.draftText,
    reviewContentToken: request.reviewContentToken,
  })
  if (!result.ok) {
    return context.json({ error: result.error, errorCode: result.errorCode }, result.status)
  }

  return context.json(
    replyActionResponseSchema.parse({
      review: await selectReplyInboxReview(result.reviewId, sessionResult.session.organizationId),
    }),
  )
})

replyInboxRoutes.post('/api/reply-inbox/:reviewId/ignore', (context) => {
  return updateIgnoredStatus(context, true)
})

replyInboxRoutes.post('/api/reply-inbox/:reviewId/unignore', (context) => {
  return updateIgnoredStatus(context, false)
})

replyInboxRoutes.post('/api/reply-inbox/:reviewId/publish', async (context) => {
  const sessionResult = await requireActiveOrganizationSession(context)
  if (!sessionResult.ok) {
    return sessionResult.response
  }

  const request = await parsePublishRequest(context)
  if (!request.ok) {
    return request.response
  }

  const publishResult = await publishReply(
    buildPublishReplyInput(
      sessionResult.session.organizationId,
      sessionResult.session.userId,
      request.reviewId,
      request.body,
    ),
  )
  if (!publishResult.ok) {
    return context.json(
      { error: publishResult.error, errorCode: publishResult.errorCode },
      publishResult.status,
    )
  }

  return context.json(
    replyActionResponseSchema.parse({
      review: await selectReplyInboxReview(request.reviewId, sessionResult.session.organizationId),
    }),
  )
})

type SaveDraftInput = {
  database: Database
  organizationId: string
  actorUserId: string
  reviewId: string
  draftText: string
  reviewContentToken: string
}

type PublishReplyInput = {
  organizationId: string
  actorUserId: string
  reviewId: string
  reviewContentToken: string
  draftText?: string
  replyDraftId?: string
  replyDraftUpdatedAt?: string
}

type SaveDraftRequest =
  | { ok: true; reviewId: string; draftText: string; reviewContentToken: string }
  | { ok: false; response: Response }

type PublishRequest =
  | { ok: true; reviewId: string; body: z.infer<typeof publishReplyRequestSchema> }
  | { ok: false; response: Response }

type DraftQueueValidation =
  | { ok: true; review: typeof reviews.$inferSelect }
  | { ok: false; status: 404 | 409; error: string }

function selectReviewForDraftQueue(organizationId: string, reviewId: string) {
  return database.query.reviews.findFirst({
    where: and(eq(reviews.id, reviewId), eq(reviews.organizationId, organizationId)),
  })
}

function validateDraftQueueReview(
  review: typeof reviews.$inferSelect | undefined,
): DraftQueueValidation {
  if (review === undefined) {
    return { ok: false, status: 404, error: 'Review not found.' }
  }
  if (!['pending', 'failed'].includes(review.replyStatus)) {
    return { ok: false, status: 409, error: 'Review is not draftable.' }
  }
  return { ok: true, review }
}

async function parseSaveDraftRequest(context: Context): Promise<SaveDraftRequest> {
  const reviewIdResult = parseUuidParam(context, 'reviewId', 'Review')
  if (!reviewIdResult.ok) {
    return { ok: false, response: reviewIdResult.response }
  }
  const bodyResult = await parseJsonBody(context, saveReplyDraftRequestSchema)
  if (!bodyResult.ok) {
    return { ok: false, response: bodyResult.response }
  }
  return {
    ok: true,
    reviewId: reviewIdResult.data,
    draftText: bodyResult.data.draftText,
    reviewContentToken: bodyResult.data.reviewContentToken,
  }
}

async function parsePublishRequest(context: Context): Promise<PublishRequest> {
  const reviewIdResult = parseUuidParam(context, 'reviewId', 'Review')
  if (!reviewIdResult.ok) {
    return { ok: false, response: reviewIdResult.response }
  }
  const bodyResult = await parseJsonBody(context, publishReplyRequestSchema)
  if (!bodyResult.ok) {
    return { ok: false, response: bodyResult.response }
  }
  return { ok: true, reviewId: reviewIdResult.data, body: bodyResult.data }
}

function saveDraftFromRequest(input: Omit<SaveDraftInput, 'database'>) {
  return saveDraft({ database, ...input })
}

function buildPublishReplyInput(
  organizationId: string,
  actorUserId: string,
  reviewId: string,
  request: z.infer<typeof publishReplyRequestSchema>,
): PublishReplyInput {
  const input: PublishReplyInput = {
    organizationId,
    actorUserId,
    reviewId,
    reviewContentToken: request.reviewContentToken,
  }
  if (request.draftText !== undefined) {
    input.draftText = request.draftText
  }
  if (request.replyDraftId !== undefined) {
    input.replyDraftId = request.replyDraftId
  }
  if (request.replyDraftUpdatedAt !== undefined) {
    input.replyDraftUpdatedAt = request.replyDraftUpdatedAt
  }
  return input
}

function saveDraft(
  input: SaveDraftInput,
): Promise<
  | { ok: true; reviewId: string }
  | { ok: false; status: 404 | 409; error: string; errorCode?: string }
> {
  return input.database.transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${input.reviewId}))`)

    const row = await selectReviewForAction(transaction, input.organizationId, input.reviewId)
    if (!row) {
      return { ok: false, status: 404, error: 'Review not found.' }
    }
    if (!isReviewContentTokenCurrent(input.reviewContentToken, row.review)) {
      return {
        ok: false,
        status: 409,
        error: 'Review changed before the Reply Draft could be saved.',
        errorCode: 'review_changed',
      }
    }
    if (row.review.replyStatus === 'published') {
      return { ok: false, status: 409, error: 'Published Reply is immutable.' }
    }
    if (row.review.replyStatus === 'ignored') {
      return {
        ok: false,
        status: 409,
        error: 'Unignore the Review before editing its Reply Draft.',
      }
    }

    await saveDraftInTransaction(transaction, row, input.actorUserId, input.draftText)

    return { ok: true, reviewId: row.review.id }
  })
}

async function saveDraftInTransaction(
  transaction: Parameters<Parameters<typeof database.transaction>[0]>[0],
  row: NonNullable<Awaited<ReturnType<typeof selectReviewForAction>>>,
  actorUserId: string,
  draftText: string,
) {
  if (row.replyDraft) {
    await transaction
      .update(replyDrafts)
      .set({ draftText, updatedAt: new Date() })
      .where(
        and(
          eq(replyDrafts.id, row.replyDraft.id),
          eq(replyDrafts.organizationId, row.review.organizationId),
        ),
      )
    await insertAuditEvent({
      transaction,
      review: row.review,
      actorUserId,
      action: 'draft_edited',
      metadata: null,
    })
  } else {
    await transaction
      .insert(replyDrafts)
      .values({
        organizationId: row.review.organizationId,
        appId: row.review.appId,
        reviewId: row.review.id,
        draftText,
        detectedReviewLanguage: row.review.detectedReviewLanguage,
        chosenReplyLanguage:
          row.review.chosenReplyLanguage ?? row.review.locale ?? row.review.language ?? 'en',
        model: 'manual',
        promptVersion: 'manual',
      })
    await insertAuditEvent({
      transaction,
      review: row.review,
      actorUserId,
      action: 'draft_created',
      metadata: { mode: 'manual' },
    })
  }

  await markReviewAsDrafted(transaction, row)
}

async function markReviewAsDrafted(
  transaction: Parameters<Parameters<typeof database.transaction>[0]>[0],
  row: ReviewActionRow,
) {
  await transaction
    .update(reviews)
    .set({
      replyStatus: 'drafted',
      draftFailureCode: null,
      draftFailureAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(eq(reviews.id, row.review.id), eq(reviews.organizationId, row.review.organizationId)),
    )
}

type PublishReplyResult =
  | { ok: true }
  | { ok: false; status: 400 | 404 | 409 | 422; error: string; errorCode?: string }

type ReviewActionRow = NonNullable<Awaited<ReturnType<typeof selectReviewForAction>>>

type PublishStoreInput = {
  provider: 'apple_app_store' | 'google_play'
  replyDraftId: string
  input: {
    externalAppId: string
    externalReviewId: string
    replyText: string
    credentialPlaintext: string
  }
}

type StorePublishResult =
  | { ok: true; externalReplyId: string | null; publishedAt: string }
  | { ok: false; errorCode: string; errorMessage: string }

type PublishValidation =
  | { ok: true; store: PublishStoreInput }
  | Exclude<PublishReplyResult, { ok: true }>

function publishReply(input: PublishReplyInput): Promise<PublishReplyResult> {
  return database.transaction((transaction) => publishReviewInTransaction(transaction, input))
}

async function publishReviewInTransaction(
  transaction: Parameters<Parameters<typeof database.transaction>[0]>[0],
  input: PublishReplyInput,
): Promise<PublishReplyResult> {
  await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${input.reviewId}))`)

  const rowResult = await selectPublishableReview(transaction, input)
  if (!rowResult.ok) {
    return rowResult
  }

  const draftResult = await preparePublishDraft(transaction, rowResult.row, input)
  if (!draftResult.ok) {
    return draftResult
  }

  const validation = validatePublishInput(draftResult.row, input)
  if (!validation.ok) {
    return validation
  }

  const publish = await publishToStore(validation.store.provider, validation.store.input)
  return finalizePublish({
    transaction,
    row: draftResult.row,
    input,
    store: validation.store,
    publish,
  })
}

async function selectPublishableReview(
  transaction: Parameters<Parameters<typeof database.transaction>[0]>[0],
  input: PublishReplyInput,
): Promise<{ ok: true; row: ReviewActionRow } | Exclude<PublishReplyResult, { ok: true }>> {
  const row = await selectReviewForAction(transaction, input.organizationId, input.reviewId)
  if (row === undefined) {
    return { ok: false, status: 404, error: 'Review not found.' }
  }
  if (!isReviewContentTokenCurrent(input.reviewContentToken, row.review)) {
    return {
      ok: false,
      status: 409,
      error: 'Review changed before the Reply could be published.',
      errorCode: 'review_changed',
    }
  }
  return { ok: true, row }
}

async function preparePublishDraft(
  transaction: Parameters<Parameters<typeof database.transaction>[0]>[0],
  row: ReviewActionRow,
  input: PublishReplyInput,
): Promise<{ ok: true; row: ReviewActionRow } | Exclude<PublishReplyResult, { ok: true }>> {
  if (input.draftText === undefined) {
    return { ok: true, row }
  }
  if (row.review.replyStatus === 'published') {
    return { ok: false, status: 409, error: 'Published Reply is immutable.' }
  }
  if (row.review.replyStatus === 'ignored') {
    return { ok: false, status: 409, error: 'Unignore the Review before editing its Reply Draft.' }
  }

  await saveDraftInTransaction(transaction, row, input.actorUserId, input.draftText)
  const latestRow = await selectReviewForAction(transaction, input.organizationId, input.reviewId)
  if (latestRow === undefined) {
    return { ok: false, status: 404, error: 'Review not found.' }
  }
  return { ok: true, row: latestRow }
}

function validatePublishInput(row: ReviewActionRow, input: PublishReplyInput): PublishValidation {
  if (input.draftText === undefined) {
    const identityValidation = validatePublishIdentity(row, input)
    if (!identityValidation.ok) {
      return identityValidation
    }
  }
  return validatePublishRow(row)
}

function validatePublishIdentity(
  row: ReviewActionRow,
  input: PublishReplyInput,
): Exclude<PublishValidation, { ok: true }> | { ok: true } {
  if (isMissingPublishIdentity(input)) {
    return { ok: false, status: 400, error: 'Reply Draft identity is required before publishing.' }
  }
  if (hasNonEmptyValue(input.replyDraftId) && row.replyDraft?.id !== input.replyDraftId) {
    return { ok: false, status: 409, error: 'Reply Draft changed before publishing.' }
  }
  if (
    hasNonEmptyValue(input.replyDraftUpdatedAt)
    && row.replyDraft?.updatedAt.toISOString() !== input.replyDraftUpdatedAt
  ) {
    return { ok: false, status: 409, error: 'Reply Draft changed before publishing.' }
  }
  return { ok: true }
}

function validatePublishRow(row: ReviewActionRow): PublishValidation {
  if (!isPublishableReviewActionRow(row)) {
    return {
      ok: false,
      status: 409,
      error: 'Review requires a saved Reply Draft before publishing.',
    }
  }
  const statusError = validatePublishableReviewStatus(row)
  if (statusError !== null) {
    return statusError
  }
  if (!hasNonEmptyValue(row.storeConnection.externalAppId)) {
    return {
      ok: false,
      status: 400,
      error: 'Store Connection is missing an external app identifier.',
      errorCode: 'missing_external_app_id',
    }
  }
  if (row.storeConnection.status !== 'active') {
    return {
      ok: false,
      status: 409,
      error: 'Store Connection is disabled.',
      errorCode: 'store_connection_disabled',
    }
  }
  if (row.credential === null) {
    return {
      ok: false,
      status: 409,
      error: 'Store Credential is missing.',
      errorCode: 'missing_credential',
    }
  }
  return {
    ok: true,
    store: {
      provider: row.storeConnection.provider,
      replyDraftId: row.replyDraft.id,
      input: {
        externalAppId: row.storeConnection.externalAppId,
        externalReviewId: row.review.externalReviewId,
        replyText: row.replyDraft.draftText,
        credentialPlaintext: decryptStoreCredentialPlaintext(row.credential),
      },
    },
  }
}

type PublishableReviewActionRow = ReviewActionRow & {
  replyDraft: NonNullable<ReviewActionRow['replyDraft']>
}

function isPublishableReviewActionRow(row: ReviewActionRow): row is PublishableReviewActionRow {
  return row.review.replyStatus === 'drafted' && row.replyDraft !== null
}

function validatePublishableReviewStatus(
  row: ReviewActionRow,
): Exclude<PublishValidation, { ok: true }> | null {
  if (row.publishedReply !== null && !row.review.changedAfterReply) {
    return {
      ok: false,
      status: 409,
      error: 'Review has no detected changes after its Published Reply.',
    }
  }
  return null
}

function isMissingPublishIdentity(input: PublishReplyInput): boolean {
  return !hasNonEmptyValue(input.replyDraftId) || !hasNonEmptyValue(input.replyDraftUpdatedAt)
}

function hasNonEmptyValue(value: string | null | undefined): value is string {
  return value !== undefined && value !== null && value.length > 0
}

type FinalizePublishInput = {
  transaction: Parameters<Parameters<typeof database.transaction>[0]>[0]
  row: ReviewActionRow
  input: PublishReplyInput
  store: PublishStoreInput
  publish: StorePublishResult
}

async function finalizePublish(input: FinalizePublishInput): Promise<PublishReplyResult> {
  if (!input.publish.ok) {
    await insertAuditEvent({
      transaction: input.transaction,
      review: input.row.review,
      actorUserId: input.input.actorUserId,
      action: 'publish_failed',
      metadata: { errorCode: input.publish.errorCode, errorMessage: input.publish.errorMessage },
    })
    return {
      ok: false,
      status: 422,
      error: input.publish.errorMessage,
      errorCode: input.publish.errorCode,
    }
  }

  await recordPublishedReply(input, input.publish)
  return { ok: true }
}

async function recordPublishedReply(
  input: FinalizePublishInput,
  publish: Extract<StorePublishResult, { ok: true }>,
) {
  await upsertPublishedReply(input, publish)
  await markReviewPublished(input)
  await insertAuditEvent({
    transaction: input.transaction,
    review: input.row.review,
    actorUserId: input.input.actorUserId,
    action: 'published',
    metadata: { externalReplyId: publish.externalReplyId },
  })
  await input.transaction
    .insert(usageEvents)
    .values({
      organizationId: input.row.review.organizationId,
      type: 'published_reply_created',
      quantity: 1,
      occurredAt: new Date(),
    })
}

async function upsertPublishedReply(
  input: FinalizePublishInput,
  publish: Extract<StorePublishResult, { ok: true }>,
) {
  await input.transaction
    .insert(publishedReplies)
    .values({
      organizationId: input.row.review.organizationId,
      appId: input.row.review.appId,
      storeConnectionId: input.row.review.storeConnectionId,
      reviewId: input.row.review.id,
      replyDraftId: input.store.replyDraftId,
      actorUserId: input.input.actorUserId,
      provider: input.row.storeConnection.provider,
      externalReplyId: publish.externalReplyId,
      replyText: input.store.input.replyText,
      publishedAt: new Date(publish.publishedAt),
    })
    .onConflictDoUpdate({
      target: publishedReplies.reviewId,
      set: {
        replyDraftId: input.store.replyDraftId,
        actorUserId: input.input.actorUserId,
        provider: input.row.storeConnection.provider,
        externalReplyId: publish.externalReplyId,
        replyText: input.store.input.replyText,
        publishedAt: new Date(publish.publishedAt),
        updatedAt: new Date(),
      },
    })
}

async function markReviewPublished(input: FinalizePublishInput) {
  await input.transaction
    .update(reviews)
    .set({
      replyStatus: 'published',
      changedAfterReply: false,
      replyBaseline: {
        title: input.row.review.title,
        body: input.row.review.body,
        rating: input.row.review.rating,
      },
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(reviews.id, input.row.review.id),
        eq(reviews.organizationId, input.input.organizationId),
        eq(reviews.replyStatus, 'drafted'),
      ),
    )
}

async function updateIgnoredStatus(context: Context, ignored: boolean) {
  const sessionResult = await requireActiveOrganizationSession(context)
  if (!sessionResult.ok) {
    return sessionResult.response
  }

  const request = await parseIgnoredStatusRequest(context)
  if (!request.ok) {
    return request.response
  }

  const result = await database.transaction((transaction) =>
    updateIgnoredStatusInTransaction(transaction, {
      organizationId: sessionResult.session.organizationId,
      actorUserId: sessionResult.session.userId,
      reviewId: request.reviewId,
      ignored,
      reviewContentToken: request.reviewContentToken,
    }),
  )

  if (!result.ok) {
    return context.json({ error: result.error, errorCode: result.errorCode }, result.status)
  }

  return context.json(
    replyActionResponseSchema.parse({
      review: await selectReplyInboxReview(result.reviewId, sessionResult.session.organizationId),
    }),
  )
}

async function parseIgnoredStatusRequest(
  context: Context,
): Promise<
  { ok: true; reviewId: string; reviewContentToken: string } | { ok: false; response: Response }
> {
  const reviewIdResult = parseUuidParam(context, 'reviewId', 'Review')
  if (!reviewIdResult.ok) {
    return { ok: false, response: reviewIdResult.response }
  }
  const bodyResult = await parseJsonBody(context, updateReviewIgnoredStatusRequestSchema)
  if (!bodyResult.ok) {
    return { ok: false, response: bodyResult.response }
  }
  return {
    ok: true,
    reviewId: reviewIdResult.data,
    reviewContentToken: bodyResult.data.reviewContentToken,
  }
}

type IgnoredStatusInput = {
  organizationId: string
  actorUserId: string
  reviewId: string
  ignored: boolean
  reviewContentToken: string
}

async function updateIgnoredStatusInTransaction(
  transaction: Parameters<Parameters<typeof database.transaction>[0]>[0],
  input: IgnoredStatusInput,
) {
  const row = await selectReviewForAction(transaction, input.organizationId, input.reviewId)
  if (row === undefined) {
    return { ok: false as const, status: 404 as const, error: 'Review not found.' }
  }
  if (!isReviewContentTokenCurrent(input.reviewContentToken, row.review)) {
    return {
      ok: false as const,
      status: 409 as const,
      error: 'Review changed before its Reply Inbox status could be updated.',
      errorCode: 'review_changed',
    }
  }
  if (row.review.replyStatus === 'published') {
    return { ok: false as const, status: 409 as const, error: 'Published Reply cannot be ignored.' }
  }
  if (!input.ignored && row.review.replyStatus !== 'ignored') {
    return { ok: false as const, status: 409 as const, error: 'Review is not ignored.' }
  }

  await transaction
    .update(reviews)
    .set({
      replyStatus: ignoredReviewStatus(row, input.ignored),
      changedAfterReply: false,
      updatedAt: new Date(),
    })
    .where(and(eq(reviews.id, row.review.id), eq(reviews.organizationId, input.organizationId)))
  await insertAuditEvent({
    transaction,
    review: row.review,
    actorUserId: input.actorUserId,
    action: input.ignored ? 'ignored' : 'unignored',
    metadata: null,
  })
  return { ok: true as const, reviewId: row.review.id }
}

function ignoredReviewStatus(
  row: ReviewActionRow,
  ignored: boolean,
): 'ignored' | 'drafted' | 'pending' | 'published' {
  if (ignored) {
    return 'ignored'
  }
  if (row.publishedReply !== null) {
    return 'published'
  }
  if (row.replyDraft !== null) {
    return 'drafted'
  }
  return 'pending'
}

async function publishToStore(
  provider: 'apple_app_store' | 'google_play',
  input: {
    externalAppId: string
    externalReviewId: string
    replyText: string
    credentialPlaintext: string
  },
): Promise<StorePublishResult> {
  try {
    if (provider === 'apple_app_store') {
      return await publishToAppleStore(input)
    }
    return await publishToGooglePlay(input)
  } catch (error) {
    if (error instanceof AppleStoreAdapterError || error instanceof GooglePlayStoreAdapterError) {
      return { ok: false, errorCode: error.code, errorMessage: error.message }
    }
    return { ok: false, errorCode: 'publish_failed', errorMessage: 'Reply publishing failed.' }
  }
}

async function publishToAppleStore(input: PublishStoreInput['input']): Promise<StorePublishResult> {
  const credential = parseAppleCredentialPlaintext(input.credentialPlaintext)
  if (!credential.ok) {
    return { ok: false, errorCode: 'invalid_credential_format', errorMessage: credential.error }
  }
  return {
    ok: true,
    ...(await appleAppStoreReviewAdapter.publishReply({
      ...input,
      credential: credential.credential,
    })),
  }
}

async function publishToGooglePlay(input: PublishStoreInput['input']): Promise<StorePublishResult> {
  const credential = parseGooglePlayCredentialPlaintext(input.credentialPlaintext)
  if (!credential.ok) {
    return {
      ok: false,
      errorCode: 'invalid_google_credential_format',
      errorMessage: credential.error,
    }
  }
  return {
    ok: true,
    ...(await googlePlayReviewAdapter.publishReply({
      ...input,
      credential: credential.credential,
    })),
  }
}

async function selectReviewForAction(
  transaction: Parameters<Parameters<typeof database.transaction>[0]>[0],
  organizationId: string,
  reviewId: string,
) {
  await transaction.execute(sql`
    select ${reviews.id}
    from ${reviews}
    where ${reviews.id} = ${reviewId}
      and ${reviews.organizationId} = ${organizationId}
    for update
  `)
  const [row] = await transaction
    .select({
      review: reviews,
      app: apps,
      storeConnection: storeConnections,
      credential: storeCredentials,
      replyDraft: replyDrafts,
      publishedReply: publishedReplies,
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
    .leftJoin(storeCredentials, eq(storeCredentials.storeConnectionId, storeConnections.id))
    .leftJoin(replyDrafts, eq(reviews.id, replyDrafts.reviewId))
    .leftJoin(publishedReplies, eq(reviews.id, publishedReplies.reviewId))
    .where(and(eq(reviews.id, reviewId), eq(reviews.organizationId, organizationId)))
    .limit(1)

  return row
}

async function selectReplyInboxReview(reviewId: string, organizationId: string) {
  const [row] = await database
    .select({
      review: reviews,
      app: apps,
      storeConnection: storeConnections,
      replyDraft: replyDrafts,
      publishedReply: publishedReplies,
    })
    .from(reviews)
    .innerJoin(apps, eq(reviews.appId, apps.id))
    .innerJoin(storeConnections, eq(reviews.storeConnectionId, storeConnections.id))
    .leftJoin(replyDrafts, eq(reviews.id, replyDrafts.reviewId))
    .leftJoin(publishedReplies, eq(reviews.id, publishedReplies.reviewId))
    .where(and(eq(reviews.id, reviewId), eq(reviews.organizationId, organizationId)))
    .limit(1)

  if (!row) {
    throw new Error('Review action did not return a row.')
  }

  const [lastFailure] = await database
    .select({ event: replyAuditEvents })
    .from(replyAuditEvents)
    .where(
      and(
        eq(replyAuditEvents.reviewId, reviewId),
        eq(replyAuditEvents.organizationId, organizationId),
        eq(replyAuditEvents.action, 'publish_failed'),
      ),
    )
    .orderBy(desc(replyAuditEvents.createdAt))
    .limit(1)

  return toReplyInboxReview(row, lastFailure?.event ?? null)
}

type ReplyInboxRow = {
  review: typeof reviews.$inferSelect
  app: typeof apps.$inferSelect
  storeConnection: typeof storeConnections.$inferSelect
  replyDraft: typeof replyDrafts.$inferSelect | null
  publishedReply: typeof publishedReplies.$inferSelect | null
}

function toReplyInboxReview(
  row: ReplyInboxRow,
  lastPublishFailure: typeof replyAuditEvents.$inferSelect | null,
) {
  return {
    id: row.review.id,
    appId: row.review.appId,
    appName: row.app.name,
    storeConnectionId: row.review.storeConnectionId,
    provider: row.storeConnection.provider,
    externalReviewId: row.review.externalReviewId,
    authorDisplayName: row.review.authorDisplayName,
    rating: row.review.rating,
    title: row.review.title,
    body: row.review.body,
    language: row.review.language,
    version: row.review.version,
    country: row.review.country,
    locale: row.review.locale,
    reviewedAt: row.review.reviewedAt.toISOString(),
    replyStatus: row.review.replyStatus,
    reviewContentToken: createReviewContentToken(row.review),
    changedAfterReply: row.review.changedAfterReply,
    replyBaseline: row.review.replyBaseline,
    draftFailureCode: row.review.draftFailureCode,
    draftFailureAt: row.review.draftFailureAt?.toISOString() ?? null,
    replyDraft: toReplyDraft(row.replyDraft),
    publishedReply: toPublishedReply(row.publishedReply),
    lastPublishFailure: toLastPublishFailure(lastPublishFailure),
  }
}

function toReplyDraft(replyDraft: typeof replyDrafts.$inferSelect | null) {
  if (replyDraft === null) {
    return null
  }
  return {
    id: replyDraft.id,
    draftText: replyDraft.draftText,
    chosenReplyLanguage: replyDraft.chosenReplyLanguage,
    updatedAt: replyDraft.updatedAt.toISOString(),
  }
}

function toPublishedReply(publishedReply: typeof publishedReplies.$inferSelect | null) {
  if (publishedReply === null) {
    return null
  }
  return {
    id: publishedReply.id,
    externalReplyId: publishedReply.externalReplyId,
    replyText: publishedReply.replyText,
    publishedAt: publishedReply.publishedAt.toISOString(),
  }
}

function toLastPublishFailure(lastFailure: typeof replyAuditEvents.$inferSelect | null) {
  if (lastFailure === null) {
    return null
  }
  const parsedMetadata = auditMetadataSchema.safeParse(lastFailure.metadata)
  const metadata = parsedMetadata.success ? parsedMetadata.data : {}
  return {
    createdAt: lastFailure.createdAt.toISOString(),
    errorCode: metadataText(metadata.errorCode),
    errorMessage: metadataText(metadata.errorMessage),
  }
}

function toReplyAuditEvent(event: typeof replyAuditEvents.$inferSelect) {
  return {
    id: event.id,
    reviewId: event.reviewId,
    actorUserId: event.actorUserId,
    action: event.action,
    metadata: publicAuditMetadataFromEvent(event),
    createdAt: event.createdAt.toISOString(),
  }
}

function publicAuditMetadataFromEvent(event: typeof replyAuditEvents.$inferSelect) {
  const parsedMetadata = auditMetadataSchema.safeParse(event.metadata)
  return publicAuditMetadata(event.action, parsedMetadata.success ? parsedMetadata.data : null)
}

type InsertAuditEventInput = {
  transaction: Parameters<Parameters<typeof database.transaction>[0]>[0]
  review: typeof reviews.$inferSelect
  actorUserId: string
  action: typeof replyAuditEvents.$inferInsert.action
  metadata: AuditMetadata | null
}

async function insertAuditEvent(input: InsertAuditEventInput) {
  await input.transaction
    .insert(replyAuditEvents)
    .values({
      organizationId: input.review.organizationId,
      appId: input.review.appId,
      reviewId: input.review.id,
      actorUserId: input.actorUserId,
      action: input.action,
      metadata: input.metadata,
    })
}

function replyInboxStatusSort() {
  return sql<number>`case ${reviews.replyStatus} when 'drafted' then 0 when 'failed' then 1 when 'pending' then 2 when 'ignored' then 3 when 'published' then 4 else 5 end`
}

function optionalQueryValue(value: string | undefined): string | undefined {
  return value === undefined || value.length === 0 ? undefined : value
}

function publicAuditMetadata(
  action: typeof replyAuditEvents.$inferSelect.action,
  metadata: AuditMetadata | null,
): Record<string, string> | null {
  if (metadata === null) {
    return null
  }

  if (action === 'draft_created') {
    return pickStringMetadata(metadata, ['mode'])
  }

  if (action === 'publish_failed') {
    return pickStringMetadata(metadata, ['errorCode', 'errorMessage'])
  }

  if (action === 'published') {
    return pickStringMetadata(metadata, ['externalReplyId'])
  }

  return null
}

function pickStringMetadata(
  metadata: AuditMetadata,
  keys: readonly AuditMetadataKey[],
): Record<string, string> | null {
  const result: Record<string, string> = {}
  for (const key of keys) {
    const valueResult = z.string().safeParse(metadata[key])
    if (valueResult.success && valueResult.data.length > 0) {
      result[key] = valueResult.data
    }
  }

  return Object.keys(result).length > 0 ? result : null
}

function metadataText(value: AuditMetadata[AuditMetadataKey]): string | null {
  return value === undefined || value === null ? null : value.toString()
}
