import { reviewTopicSchema, saveTopicRequestSchema } from '@reviewinbox/contracts'
import { reviewAnalysisEvents, reviewTopics } from '@reviewinbox/db'
import type { Context } from 'hono'

import { parseJsonBody, parseUuidParam } from '../../http/validation'
import { isUniqueViolation } from './errors'
import type { AnalysisRouteDependencies } from './index'
import { findApp, normalizeLabel, toTopicResponse } from './read-model'
import { lockApp } from './transaction-locks'

export async function createTopic(context: Context, dependencies: AnalysisRouteDependencies) {
  const access = await loadManagerApp(context, dependencies)
  if ('response' in access) {
    return access.response
  }
  const bodyResult = await parseJsonBody(context, saveTopicRequestSchema)
  if (!bodyResult.ok) {
    return bodyResult.response
  }
  const result = await insertTopicSafely(dependencies.database, {
    appId: access.app.id,
    organizationId: access.app.organizationId,
    input: bodyResult.data,
    actorUserId: access.session.userId,
  })
  if ('conflict' in result) {
    return context.json({ error: 'A Topic with this label already exists.' }, 409)
  }
  return context.json(
    reviewTopicSchema.parse(
      toTopicResponse(result.topic, [], new Map([[result.topic.id, result.topic]])),
    ),
    201,
  )
}

type ManagerSession = Extract<
  Awaited<ReturnType<AnalysisRouteDependencies['requireManagerSession']>>,
  { ok: true }
>['session']
type ManagerApp = { session: ManagerSession; app: NonNullable<Awaited<ReturnType<typeof findApp>>> }

async function loadManagerApp(
  context: Context,
  dependencies: AnalysisRouteDependencies,
): Promise<ManagerApp | { response: Response }> {
  const sessionResult = await dependencies.requireManagerSession(context)
  if (!sessionResult.ok) {
    return { response: sessionResult.response }
  }
  const appId = parseUuidParam(context, 'appId', 'App')
  if (!appId.ok) {
    return { response: appId.response }
  }
  const app = await findApp(dependencies.database, sessionResult.session.organizationId, appId.data)
  if (app === undefined) {
    return { response: context.json({ error: 'App not found.' }, 404) }
  }
  return { app, session: sessionResult.session }
}

async function insertTopicSafely(
  database: AnalysisRouteDependencies['database'],
  input: Parameters<typeof insertTopic>[1],
): Promise<{ topic: Awaited<ReturnType<typeof insertTopic>> } | { conflict: true }> {
  try {
    return { topic: await insertTopic(database, input) }
  } catch (error) {
    if (error instanceof Error && isUniqueViolation(error)) {
      return { conflict: true }
    }
    throw error
  }
}

function insertTopic(
  database: AnalysisRouteDependencies['database'],
  input: {
    appId: string
    organizationId: string
    input: {
      label: string
      description: string
      status?: 'pending' | 'approved' | 'rejected' | undefined
    }
    actorUserId: string
  },
) {
  return database.transaction(async (transaction) => {
    await lockApp(transaction, input.appId)
    const [topic] = await transaction
      .insert(reviewTopics)
      .values({
        organizationId: input.organizationId,
        appId: input.appId,
        label: input.input.label,
        normalizedLabel: normalizeLabel(input.input.label),
        description: input.input.description,
        status: input.input.status ?? 'approved',
        origin: 'human',
      })
      .returning()
    if (topic === undefined) {
      throw new Error('Topic creation did not return a row.')
    }
    await transaction
      .insert(reviewAnalysisEvents)
      .values({
        organizationId: input.organizationId,
        appId: input.appId,
        topicId: topic.id,
        actorUserId: input.actorUserId,
        action: 'topic_created',
      })
    return topic
  })
}
