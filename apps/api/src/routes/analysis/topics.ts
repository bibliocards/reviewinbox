import {
  mergeTopicRequestSchema,
  reviewTopicSchema,
  topicListResponseSchema,
  updateTopicRequestSchema,
} from '@reviewinbox/contracts'
import { reviewTopics } from '@reviewinbox/db'
import type { Context } from 'hono'
import { z } from 'zod'

import { parseJsonBody, parseUuidParam } from '../../http/validation'
import { readAnalysisSummary } from './dashboard-query'
import { isUniqueViolation } from './errors'
import type { AnalysisRouteDependencies } from './index'
import { findApp, findTopic, toTopicResponse } from './read-model'
import {
  buildTopicUpdateValues,
  markDiscoveryRequested,
  persistTopicUpdate,
} from './topic-lifecycle'
import { persistTopicMerge, type MergeResult } from './topic-merge'

type TopicRow = typeof reviewTopics.$inferSelect
type ManagerSession = Extract<
  Awaited<ReturnType<AnalysisRouteDependencies['requireManagerSession']>>,
  { ok: true }
>['session']
type ManagerApp = { session: ManagerSession; app: NonNullable<Awaited<ReturnType<typeof findApp>>> }

export async function updateTopic(context: Context, dependencies: AnalysisRouteDependencies) {
  const access = await loadManagerApp(context, dependencies)
  if ('response' in access) {
    return access.response
  }
  const request = await parseTopicUpdateRequest(context)
  if ('response' in request) {
    return request.response
  }
  const existing = await findTopicForApp(dependencies, access.app, request.topicId)
  if (existing === undefined) {
    return context.json({ error: 'Topic not found.' }, 404)
  }
  return runTopicUpdate(context, { dependencies, access, existing, input: request.data })
}

export async function mergeTopic(context: Context, dependencies: AnalysisRouteDependencies) {
  const access = await loadManagerApp(context, dependencies)
  if ('response' in access) {
    return access.response
  }
  const request = await parseTopicMergeRequest(context)
  if ('response' in request) {
    return request.response
  }
  const result = await persistTopicMerge(dependencies.database, {
    app: access.app,
    sourceId: request.topicId,
    targetId: request.data.targetTopicId,
    actorUserId: access.session.userId,
  })
  if (result.kind !== 'merged') {
    return mergeError(context, result.kind)
  }
  return context.json(topicResponse(result.target))
}

type ParsedTopicUpdateRequest =
  | { topicId: string; data: z.infer<typeof updateTopicRequestSchema> }
  | { response: Response }
type ParsedTopicMergeRequest =
  | { topicId: string; data: z.infer<typeof mergeTopicRequestSchema> }
  | { response: Response }

async function parseTopicUpdateRequest(context: Context): Promise<ParsedTopicUpdateRequest> {
  const topicId = parseUuidParam(context, 'topicId', 'Topic')
  if (!topicId.ok) {
    return { response: topicId.response }
  }
  const data = await parseJsonBody(context, updateTopicRequestSchema)
  if (!data.ok) {
    return { response: data.response }
  }
  return { topicId: topicId.data, data: data.data }
}

async function parseTopicMergeRequest(context: Context): Promise<ParsedTopicMergeRequest> {
  const topicId = parseUuidParam(context, 'topicId', 'Topic')
  if (!topicId.ok) {
    return { response: topicId.response }
  }
  const data = await parseJsonBody(context, mergeTopicRequestSchema)
  if (!data.ok) {
    return { response: data.response }
  }
  return { topicId: topicId.data, data: data.data }
}

export async function requestDiscovery(context: Context, dependencies: AnalysisRouteDependencies) {
  const access = await loadManagerApp(context, dependencies)
  if ('response' in access) {
    return access.response
  }
  if (!dependencies.discoveryEnabled()) {
    return context.json({ error: 'Topic discovery is not configured.' }, 503)
  }
  const result = await markDiscoveryRequested(dependencies.database, access.app)
  if (result === 'cooldown') {
    return context.json({ error: 'Topic discovery was requested recently.' }, 429)
  }
  return context.json({ queued: true })
}

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

function findTopicForApp(
  dependencies: AnalysisRouteDependencies,
  app: ManagerApp['app'],
  topicId: string,
) {
  return findTopic(dependencies.database, app.organizationId, app.id, topicId)
}

function runTopicUpdate(
  context: Context,
  input: {
    dependencies: AnalysisRouteDependencies
    access: ManagerApp
    existing: TopicRow
    input: z.infer<typeof updateTopicRequestSchema>
  },
) {
  return persistTopicUpdate(input.dependencies.database, {
    app: input.access.app,
    existing: input.existing,
    values: buildTopicUpdateValues(input.input),
    rejecting: input.input.status === 'rejected',
    actorUserId: input.access.session.userId,
    metadata: input.input,
  })
    .then((result) =>
      result === null
        ? context.json({ error: 'Topic not found.' }, 404)
        : context.json(topicResponse(result)),
    )
    .catch((error) => {
      if (error instanceof Error) {
        return handleTopicMutationError(context, error)
      }
      throw error
    })
}

function topicResponse(topic: TopicRow) {
  return reviewTopicSchema.parse(toTopicResponse(topic, [], new Map([[topic.id, topic]])))
}

function handleTopicMutationError(context: Context, error: Error) {
  if (isUniqueViolation(error)) {
    return context.json({ error: 'A Topic with this label already exists.' }, 409)
  }
  throw error
}

function mergeError(context: Context, kind: Exclude<MergeResult, { kind: 'merged' }>['kind']) {
  if (kind === 'same') {
    return context.json({ error: 'A Topic cannot merge into itself.' }, 409)
  }
  if (kind === 'target_rejected') {
    return context.json({ error: 'Reopen the target Topic before merging.' }, 409)
  }
  if (kind === 'already_merged') {
    return context.json({ error: 'Merged Topics cannot be merged again.' }, 409)
  }
  return context.json({ error: 'Topic not found.' }, 404)
}

export async function listTopics(context: Context, dependencies: AnalysisRouteDependencies) {
  const sessionResult = await dependencies.requireSession(context)
  if (!sessionResult.ok) {
    return sessionResult.response
  }
  const appId = parseUuidParam(context, 'appId', 'App')
  if (!appId.ok) {
    return appId.response
  }
  const app = await findApp(dependencies.database, sessionResult.session.organizationId, appId.data)
  if (app === undefined) {
    return context.json({ error: 'App not found.' }, 404)
  }
  const summary = await readAnalysisSummary(
    dependencies.database,
    app.organizationId,
    { appId: app.id, page: 1, pageSize: 1 },
    true,
  )
  const response = {
    topics: summary.topics,
    canManage: ['owner', 'admin'].includes(sessionResult.session.role),
    discoveryEnabled: dependencies.discoveryEnabled(),
  }
  return context.json(topicListResponseSchema.parse(response))
}
