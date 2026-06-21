import {
  listReplyInboxResponseSchema,
  listReplyAuditEventsQuerySchema,
  listReplyAuditEventsResponseSchema,
  publishReplyRequestSchema,
  queueReplyDraftResponseSchema,
  replyActionResponseSchema,
  replyAuditEventsResponseSchema,
  replyInboxFilterSchema,
  saveReplyDraftRequestSchema,
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
import { decryptStoreCredentialPlaintext, parseAppleCredentialPlaintext, parseGooglePlayCredentialPlaintext } from '@reviewinbox/sync'
import {
  appleAppStoreReviewAdapter,
  AppleStoreAdapterError,
  googlePlayReviewAdapter,
  GooglePlayStoreAdapterError,
} from '@reviewinbox/store-adapters'
import { and, count, desc, eq, inArray, sql } from 'drizzle-orm'
import type { Context } from 'hono'
import { Hono } from 'hono'
import { z } from 'zod'

import { requireActiveOrganizationSession } from '../auth/session'
import { database } from '../db'
import { parseJsonBody, parseUuidParam } from '../http/validation'
import { enqueueGenerateReplyDraftJobs } from '../queue'

export const replyInboxRoutes = new Hono()

const appIdQuerySchema = z.uuid().optional()
const defaultLimit = 100

replyInboxRoutes.get('/api/reply-inbox', async (context) => {
  const sessionResult = await requireActiveOrganizationSession(context)
  if (!sessionResult.ok) {
    return sessionResult.response
  }

  const filterResult = replyInboxFilterSchema.optional().default('actionable').safeParse(context.req.query('filter'))
  if (!filterResult.success) {
    return context.json({ error: 'Invalid Reply Inbox filter.' }, 400)
  }

  const appIdResult = appIdQuerySchema.safeParse(context.req.query('appId') || undefined)
  if (!appIdResult.success) {
    return context.json({ error: 'App not found.' }, 404)
  }

  const where = [eq(reviews.organizationId, sessionResult.session.organizationId)]
  if (appIdResult.data) {
    where.push(eq(reviews.appId, appIdResult.data))
  }

  if (filterResult.data === 'actionable') {
    where.push(inArray(reviews.replyStatus, ['drafted', 'failed', 'pending']))
  } else {
    where.push(eq(reviews.replyStatus, filterResult.data))
  }

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
    .where(and(...where))
    .orderBy(replyInboxStatusSort(), desc(reviews.reviewedAt))
    .limit(defaultLimit)

  const reviewIds = rows.map((row) => row.review.id)
  const publishFailures = reviewIds.length
    ? await database
        .select({ event: replyAuditEvents })
        .from(replyAuditEvents)
        .where(
          and(
            eq(replyAuditEvents.organizationId, sessionResult.session.organizationId),
            inArray(replyAuditEvents.reviewId, reviewIds),
            eq(replyAuditEvents.action, 'publish_failed'),
          ),
        )
        .orderBy(desc(replyAuditEvents.createdAt))
    : []
  const latestPublishFailureByReviewId = new Map<string, typeof replyAuditEvents.$inferSelect>()
  for (const row of publishFailures) {
    if (!latestPublishFailureByReviewId.has(row.event.reviewId)) {
      latestPublishFailureByReviewId.set(row.event.reviewId, row.event)
    }
  }

  return context.json(
    listReplyInboxResponseSchema.parse({
      reviews: rows.map((row) => toReplyInboxReview(row, latestPublishFailureByReviewId.get(row.review.id) ?? null)),
    }),
  )
})

replyInboxRoutes.get('/api/reply-audit-events', async (context) => {
  const sessionResult = await requireActiveOrganizationSession(context)
  if (!sessionResult.ok) {
    return sessionResult.response
  }

  const queryResult = listReplyAuditEventsQuerySchema.safeParse({
    page: context.req.query('page') ?? undefined,
    pageSize: context.req.query('pageSize') ?? undefined,
    appId: context.req.query('appId') || undefined,
    action: context.req.query('action') || undefined,
  })
  if (!queryResult.success) {
    return context.json({ error: 'Invalid Reply audit filter.' }, 400)
  }

  const { page, pageSize, appId, action } = queryResult.data
  const where = [eq(replyAuditEvents.organizationId, sessionResult.session.organizationId)]
  if (appId) {
    where.push(eq(replyAuditEvents.appId, appId))
  }
  if (action) {
    where.push(eq(replyAuditEvents.action, action))
  }

  const [totalResult] = await database
    .select({ total: count() })
    .from(replyAuditEvents)
    .where(and(...where))

  const rows = await database
    .select({
      event: replyAuditEvents,
      app: apps,
      review: reviews,
      actor: user,
    })
    .from(replyAuditEvents)
    .innerJoin(apps, eq(replyAuditEvents.appId, apps.id))
    .innerJoin(reviews, eq(replyAuditEvents.reviewId, reviews.id))
    .leftJoin(user, eq(replyAuditEvents.actorUserId, user.id))
    .where(and(...where))
    .orderBy(desc(replyAuditEvents.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  return context.json(
    listReplyAuditEventsResponseSchema.parse({
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
        metadata: publicAuditMetadata(row.event.action, row.event.metadata),
        createdAt: row.event.createdAt.toISOString(),
      })),
      page,
      pageSize,
      total: totalResult?.total ?? 0,
    }),
  )
})

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
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  })

  return context.json(
    replyAuditEventsResponseSchema.parse({
      events: events.map((event) => ({
        id: event.id,
        reviewId: event.reviewId,
        actorUserId: event.actorUserId,
        action: event.action,
        metadata: publicAuditMetadata(event.action, event.metadata),
        createdAt: event.createdAt.toISOString(),
      })),
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

  const review = await database.query.reviews.findFirst({
    where: and(eq(reviews.id, reviewIdResult.data), eq(reviews.organizationId, sessionResult.session.organizationId)),
  })
  if (!review) {
    return context.json({ error: 'Review not found.' }, 404)
  }
  if (!['pending', 'failed'].includes(review.replyStatus)) {
    return context.json({ error: 'Review is not draftable.' }, 409)
  }

  const queuedCount = await enqueueGenerateReplyDraftJobs({ organizationId: sessionResult.session.organizationId, reviewIds: [review.id] })
  return context.json(queueReplyDraftResponseSchema.parse({ queued: queuedCount === 1 }))
})

replyInboxRoutes.put('/api/reply-inbox/:reviewId/draft', async (context) => {
  const sessionResult = await requireActiveOrganizationSession(context)
  if (!sessionResult.ok) {
    return sessionResult.response
  }

  const reviewIdResult = parseUuidParam(context, 'reviewId', 'Review')
  if (!reviewIdResult.ok) {
    return reviewIdResult.response
  }

  const bodyResult = await parseJsonBody(context, saveReplyDraftRequestSchema)
  if (!bodyResult.ok) {
    return bodyResult.response
  }

  const result = await saveDraft({
    database,
    organizationId: sessionResult.session.organizationId,
    actorUserId: sessionResult.session.userId,
    reviewId: reviewIdResult.data,
    draftText: bodyResult.data.draftText,
  })
  if (!result.ok) {
    return context.json({ error: result.error }, result.status)
  }

  return context.json(
    replyActionResponseSchema.parse({ review: await selectReplyInboxReview(result.reviewId, sessionResult.session.organizationId) }),
  )
})

replyInboxRoutes.post('/api/reply-inbox/:reviewId/ignore', async (context) => {
  return updateIgnoredStatus(context, true)
})

replyInboxRoutes.post('/api/reply-inbox/:reviewId/unignore', async (context) => {
  return updateIgnoredStatus(context, false)
})

replyInboxRoutes.post('/api/reply-inbox/:reviewId/publish', async (context) => {
  const sessionResult = await requireActiveOrganizationSession(context)
  if (!sessionResult.ok) {
    return sessionResult.response
  }

  const reviewIdResult = parseUuidParam(context, 'reviewId', 'Review')
  if (!reviewIdResult.ok) {
    return reviewIdResult.response
  }

  const bodyResult = await parseJsonBody(context, publishReplyRequestSchema)
  if (!bodyResult.ok) {
    return bodyResult.response
  }

  const publishResult = await publishReply({
    organizationId: sessionResult.session.organizationId,
    actorUserId: sessionResult.session.userId,
    reviewId: reviewIdResult.data,
    ...(bodyResult.data.draftText !== undefined ? { draftText: bodyResult.data.draftText } : {}),
    ...(bodyResult.data.replyDraftId !== undefined ? { replyDraftId: bodyResult.data.replyDraftId } : {}),
    ...(bodyResult.data.replyDraftUpdatedAt !== undefined ? { replyDraftUpdatedAt: bodyResult.data.replyDraftUpdatedAt } : {}),
  })
  if (!publishResult.ok) {
    return context.json({ error: publishResult.error, errorCode: publishResult.errorCode }, publishResult.status)
  }

  return context.json(
    replyActionResponseSchema.parse({ review: await selectReplyInboxReview(reviewIdResult.data, sessionResult.session.organizationId) }),
  )
})

type SaveDraftInput = {
  database: Database
  organizationId: string
  actorUserId: string
  reviewId: string
  draftText: string
}

async function saveDraft(input: SaveDraftInput): Promise<{ ok: true; reviewId: string } | { ok: false; status: 404 | 409; error: string }> {
  return input.database.transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${input.reviewId}))`)

    const row = await selectReviewForAction(transaction, input.organizationId, input.reviewId)
    if (!row) {
      return { ok: false, status: 404, error: 'Review not found.' }
    }
    if (row.review.replyStatus === 'published') {
      return { ok: false, status: 409, error: 'Published Reply is immutable.' }
    }
    if (row.review.replyStatus === 'ignored') {
      return { ok: false, status: 409, error: 'Unignore the Review before editing its Reply Draft.' }
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
      .where(and(eq(replyDrafts.id, row.replyDraft.id), eq(replyDrafts.organizationId, row.review.organizationId)))
    await insertAuditEvent(transaction, row.review, actorUserId, 'draft_edited', null)
  } else {
    await transaction.insert(replyDrafts).values({
      organizationId: row.review.organizationId,
      appId: row.review.appId,
      reviewId: row.review.id,
      draftText,
      detectedReviewLanguage: row.review.detectedReviewLanguage,
      chosenReplyLanguage: row.review.chosenReplyLanguage ?? row.review.locale ?? row.review.language ?? 'en',
      model: 'manual',
      promptVersion: 'manual',
    })
    await insertAuditEvent(transaction, row.review, actorUserId, 'draft_created', { mode: 'manual' })
  }

  await transaction
    .update(reviews)
    .set({ replyStatus: 'drafted', draftFailureCode: null, draftFailureAt: null, updatedAt: new Date() })
    .where(and(eq(reviews.id, row.review.id), eq(reviews.organizationId, row.review.organizationId)))
}

async function publishReply(input: {
  organizationId: string
  actorUserId: string
  reviewId: string
  draftText?: string
  replyDraftId?: string
  replyDraftUpdatedAt?: string
}): Promise<{ ok: true } | { ok: false; status: 400 | 404 | 409 | 422; error: string; errorCode?: string }> {
  return database.transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${input.reviewId}))`)

    const row = await selectReviewForAction(transaction, input.organizationId, input.reviewId)
    if (!row) {
      return { ok: false, status: 404, error: 'Review not found.' }
    }

    if (input.draftText !== undefined) {
      if (row.review.replyStatus === 'published') {
        return { ok: false, status: 409, error: 'Published Reply is immutable.' }
      }
      if (row.review.replyStatus === 'ignored') {
        return { ok: false, status: 409, error: 'Unignore the Review before editing its Reply Draft.' }
      }
      await saveDraftInTransaction(transaction, row, input.actorUserId, input.draftText)
    }

    const latestRow = input.draftText === undefined ? row : await selectReviewForAction(transaction, input.organizationId, input.reviewId)
    if (!latestRow) {
      return { ok: false, status: 404, error: 'Review not found.' }
    }

    if (input.draftText === undefined && (!input.replyDraftId || !input.replyDraftUpdatedAt)) {
      return { ok: false, status: 400, error: 'Reply Draft identity is required before publishing.' }
    }
    if (input.draftText === undefined && input.replyDraftId && latestRow.replyDraft?.id !== input.replyDraftId) {
      return { ok: false, status: 409, error: 'Reply Draft changed before publishing.' }
    }
    if (
      input.draftText === undefined &&
      input.replyDraftUpdatedAt &&
      latestRow.replyDraft?.updatedAt.toISOString() !== input.replyDraftUpdatedAt
    ) {
      return { ok: false, status: 409, error: 'Reply Draft changed before publishing.' }
    }

    if (latestRow.review.replyStatus !== 'drafted' || !latestRow.replyDraft) {
      return { ok: false, status: 409, error: 'Review requires a saved Reply Draft before publishing.' }
    }
    if (latestRow.publishedReply) {
      return { ok: false, status: 409, error: 'Review already has a Published Reply.' }
    }
    if (!latestRow.storeConnection.externalAppId) {
      return {
        ok: false,
        status: 400,
        error: 'Store Connection is missing an external app identifier.',
        errorCode: 'missing_external_app_id',
      }
    }
    if (latestRow.storeConnection.status !== 'active') {
      return { ok: false, status: 409, error: 'Store Connection is disabled.', errorCode: 'store_connection_disabled' }
    }
    if (!latestRow.credential) {
      return { ok: false, status: 409, error: 'Store Credential is missing.', errorCode: 'missing_credential' }
    }

    const credentialPlaintext = decryptStoreCredentialPlaintext(latestRow.credential)
    const publish = await publishToStore(latestRow.storeConnection.provider, {
      externalAppId: latestRow.storeConnection.externalAppId,
      externalReviewId: latestRow.review.externalReviewId,
      replyText: latestRow.replyDraft.draftText,
      credentialPlaintext,
    })

    if (!publish.ok) {
      await insertAuditEvent(transaction, latestRow.review, input.actorUserId, 'publish_failed', {
        errorCode: publish.errorCode,
        errorMessage: publish.errorMessage,
      })
      return { ok: false, status: 422, error: publish.errorMessage, errorCode: publish.errorCode }
    }

    await transaction.insert(publishedReplies).values({
      organizationId: latestRow.review.organizationId,
      appId: latestRow.review.appId,
      storeConnectionId: latestRow.review.storeConnectionId,
      reviewId: latestRow.review.id,
      replyDraftId: latestRow.replyDraft.id,
      actorUserId: input.actorUserId,
      provider: latestRow.storeConnection.provider,
      externalReplyId: publish.externalReplyId,
      replyText: latestRow.replyDraft.draftText,
      publishedAt: new Date(publish.publishedAt),
    })
    await transaction
      .update(reviews)
      .set({ replyStatus: 'published', updatedAt: new Date() })
      .where(and(eq(reviews.id, latestRow.review.id), eq(reviews.organizationId, input.organizationId), eq(reviews.replyStatus, 'drafted')))
    await insertAuditEvent(transaction, latestRow.review, input.actorUserId, 'published', { externalReplyId: publish.externalReplyId })
    await transaction.insert(usageEvents).values({
      organizationId: latestRow.review.organizationId,
      type: 'published_reply_created',
      quantity: 1,
      occurredAt: new Date(),
    })

    return { ok: true }
  })
}

async function updateIgnoredStatus(context: Context, ignored: boolean) {
  const sessionResult = await requireActiveOrganizationSession(context)
  if (!sessionResult.ok) {
    return sessionResult.response
  }

  const reviewIdResult = parseUuidParam(context, 'reviewId', 'Review')
  if (!reviewIdResult.ok) {
    return reviewIdResult.response
  }

  const result = await database.transaction(async (transaction) => {
    const row = await selectReviewForAction(transaction, sessionResult.session.organizationId, reviewIdResult.data)
    if (!row) {
      return { ok: false as const, status: 404 as const, error: 'Review not found.' }
    }
    if (row.review.replyStatus === 'published') {
      return { ok: false as const, status: 409 as const, error: 'Published Reply cannot be ignored.' }
    }

    const nextStatus = ignored ? 'ignored' : row.replyDraft ? 'drafted' : 'pending'
    await transaction
      .update(reviews)
      .set({ replyStatus: nextStatus, updatedAt: new Date() })
      .where(and(eq(reviews.id, row.review.id), eq(reviews.organizationId, sessionResult.session.organizationId)))
    await insertAuditEvent(transaction, row.review, sessionResult.session.userId, ignored ? 'ignored' : 'unignored', null)
    return { ok: true as const, reviewId: row.review.id }
  })

  if (!result.ok) {
    return context.json({ error: result.error }, result.status)
  }

  return context.json(
    replyActionResponseSchema.parse({ review: await selectReplyInboxReview(result.reviewId, sessionResult.session.organizationId) }),
  )
}

async function publishToStore(
  provider: 'apple_app_store' | 'google_play',
  input: { externalAppId: string; externalReviewId: string; replyText: string; credentialPlaintext: string },
): Promise<{ ok: true; externalReplyId: string | null; publishedAt: string } | { ok: false; errorCode: string; errorMessage: string }> {
  try {
    if (provider === 'apple_app_store') {
      const credential = parseAppleCredentialPlaintext(input.credentialPlaintext)
      if (!credential.ok) {
        return { ok: false, errorCode: 'invalid_credential_format', errorMessage: credential.error }
      }
      return { ok: true, ...(await appleAppStoreReviewAdapter.publishReply({ ...input, credential: credential.credential })) }
    }

    const credential = parseGooglePlayCredentialPlaintext(input.credentialPlaintext)
    if (!credential.ok) {
      return { ok: false, errorCode: 'invalid_google_credential_format', errorMessage: credential.error }
    }
    return { ok: true, ...(await googlePlayReviewAdapter.publishReply({ ...input, credential: credential.credential })) }
  } catch (error) {
    if (error instanceof AppleStoreAdapterError || error instanceof GooglePlayStoreAdapterError) {
      return { ok: false, errorCode: error.code, errorMessage: error.message }
    }
    return { ok: false, errorCode: 'publish_failed', errorMessage: 'Reply publishing failed.' }
  }
}

async function selectReviewForAction(
  transaction: Parameters<Parameters<typeof database.transaction>[0]>[0],
  organizationId: string,
  reviewId: string,
) {
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
      and(eq(reviews.storeConnectionId, storeConnections.id), eq(storeConnections.organizationId, organizationId)),
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
    .select({ review: reviews, app: apps, storeConnection: storeConnections, replyDraft: replyDrafts, publishedReply: publishedReplies })
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

function toReplyInboxReview(
  row: {
    review: typeof reviews.$inferSelect
    app: typeof apps.$inferSelect
    storeConnection: typeof storeConnections.$inferSelect
    replyDraft: typeof replyDrafts.$inferSelect | null
    publishedReply: typeof publishedReplies.$inferSelect | null
  },
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
    draftFailureCode: row.review.draftFailureCode,
    draftFailureAt: row.review.draftFailureAt?.toISOString() ?? null,
    replyDraft: row.replyDraft
      ? {
          id: row.replyDraft.id,
          draftText: row.replyDraft.draftText,
          chosenReplyLanguage: row.replyDraft.chosenReplyLanguage,
          updatedAt: row.replyDraft.updatedAt.toISOString(),
        }
      : null,
    publishedReply: row.publishedReply
      ? {
          id: row.publishedReply.id,
          externalReplyId: row.publishedReply.externalReplyId,
          replyText: row.publishedReply.replyText,
          publishedAt: row.publishedReply.publishedAt.toISOString(),
        }
      : null,
    lastPublishFailure: lastPublishFailure
      ? {
          createdAt: lastPublishFailure.createdAt.toISOString(),
          errorCode: normalizeAuditMetadata(lastPublishFailure.metadata)?.['errorCode']?.toString() ?? null,
          errorMessage: normalizeAuditMetadata(lastPublishFailure.metadata)?.['errorMessage']?.toString() ?? null,
        }
      : null,
  }
}

async function insertAuditEvent(
  transaction: Parameters<Parameters<typeof database.transaction>[0]>[0],
  review: typeof reviews.$inferSelect,
  actorUserId: string,
  action: typeof replyAuditEvents.$inferInsert.action,
  metadata: Record<string, unknown> | null,
) {
  await transaction.insert(replyAuditEvents).values({
    organizationId: review.organizationId,
    appId: review.appId,
    reviewId: review.id,
    actorUserId,
    action,
    metadata,
  })
}

function replyInboxStatusSort() {
  return sql<number>`case ${reviews.replyStatus} when 'drafted' then 0 when 'failed' then 1 when 'pending' then 2 when 'ignored' then 3 when 'published' then 4 else 5 end`
}

function normalizeAuditMetadata(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function publicAuditMetadata(action: typeof replyAuditEvents.$inferSelect.action, value: unknown): Record<string, unknown> | null {
  const metadata = normalizeAuditMetadata(value)
  if (!metadata) {
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

function pickStringMetadata(metadata: Record<string, unknown>, keys: string[]): Record<string, string> | null {
  const result: Record<string, string> = {}
  for (const key of keys) {
    const value = metadata[key]
    if (typeof value === 'string' && value.length > 0) {
      result[key] = value
    }
  }

  return Object.keys(result).length > 0 ? result : null
}
