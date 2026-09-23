import {
  getReviewAnalysisInputHash,
  reviewAnalysisCriteriaVersion,
  type TopicDiscoveryProvider,
} from '@reviewinbox/ai'
import {
  apps,
  reviewAnalyses,
  reviewTopics,
  reviews,
  usageEvents,
  type Database,
} from '@reviewinbox/db'
import { and, eq, inArray, isNull, or } from 'drizzle-orm'

import { loadTopicDiscoveryCandidates } from './topic-discovery-candidates'

export type TopicDiscoveryWorkerRuntime = {
  database: Database
  topicDiscoveryProvider: TopicDiscoveryProvider | null
}

const topicDiscoveryReviewCharacterLimit = 12_000
const topicDiscoveryCatalogueCharacterLimit = 12_000

export type DiscoveryContext = {
  app: { id: string; lastTopicDiscoveryAt: Date | null; topicDiscoveryRequestedAt: Date | null }
  topics: Array<{ label: string; description: string; aliases: string[] }>
  boundedTopics: Array<{ label: string; description: string; aliases: string[] }>
  uncovered: Array<{
    id: string
    title: string | null
    body: string
    rating: number
    version: string | null
    language: string | null
    analysisInputHash: string
    analysisAnalyzedAt: Date
  }>
}

export async function discoverTopicsForApp(
  runtime: TopicDiscoveryWorkerRuntime,
  payload: { organizationId: string; appId: string; trigger: 'daily' | 'manual' },
): Promise<void> {
  if (runtime.topicDiscoveryProvider === null) {
    return
  }
  const context = await loadDiscoveryContext(runtime.database, payload)
  if (context === undefined) {
    return
  }
  if (context.uncovered.length === 0) {
    await markDiscoveryComplete(runtime, payload, context.app)
    return
  }
  const proposals = await runtime.topicDiscoveryProvider.proposeTopics({
    reviews: context.uncovered.map(({ title, body, rating }) => ({
      title: title?.slice(0, 500) ?? null,
      body: body.slice(0, topicDiscoveryReviewCharacterLimit),
      rating,
    })),
    existingTopics: context.boundedTopics,
  })
  const newProposals = deduplicateTopicProposals(proposals, context.topics)
  await persistDiscoveryResults(runtime.database, payload, context, newProposals)
}

export async function loadDiscoveryContext(
  database: Database,
  payload: { organizationId: string; appId: string },
): Promise<DiscoveryContext | undefined> {
  const [app] = await database
    .select({
      id: apps.id,
      lastTopicDiscoveryAt: apps.lastTopicDiscoveryAt,
      topicDiscoveryRequestedAt: apps.topicDiscoveryRequestedAt,
    })
    .from(apps)
    .where(and(eq(apps.id, payload.appId), eq(apps.organizationId, payload.organizationId)))
    .limit(1)
  if (app === undefined) {
    return undefined
  }
  const topics = await database
    .select({
      label: reviewTopics.label,
      description: reviewTopics.description,
      aliases: reviewTopics.aliases,
    })
    .from(reviewTopics)
    .where(
      and(eq(reviewTopics.appId, app.id), eq(reviewTopics.organizationId, payload.organizationId)),
    )
  const uncovered = await loadTopicDiscoveryCandidates({
    database,
    organizationId: payload.organizationId,
    appId: app.id,
    criteriaVersion: reviewAnalysisCriteriaVersion,
  })
  return { app, topics, boundedTopics: boundDiscoveryTopics(topics), uncovered }
}

async function markDiscoveryComplete(
  runtime: TopicDiscoveryWorkerRuntime,
  payload: { organizationId: string; appId: string },
  snapshot: DiscoveryContext['app'],
): Promise<void> {
  await runtime.database.transaction(async (transaction) => {
    const [lockedApp] = await transaction
      .select({
        lastTopicDiscoveryAt: apps.lastTopicDiscoveryAt,
        topicDiscoveryRequestedAt: apps.topicDiscoveryRequestedAt,
      })
      .from(apps)
      .where(and(eq(apps.id, payload.appId), eq(apps.organizationId, payload.organizationId)))
      .for('update')
      .limit(1)
    if (
      lockedApp === undefined
      || lockedApp.lastTopicDiscoveryAt?.getTime() !== snapshot.lastTopicDiscoveryAt?.getTime()
      || lockedApp.topicDiscoveryRequestedAt?.getTime()
        !== snapshot.topicDiscoveryRequestedAt?.getTime()
    ) {
      return
    }
    if (await hasOutstandingDiscoveryWork(transaction, payload)) {
      return
    }
    await transaction
      .update(apps)
      .set({ lastTopicDiscoveryAt: new Date(), topicDiscoveryRequestedAt: null })
      .where(eq(apps.id, payload.appId))
  })
}

async function hasOutstandingDiscoveryWork(
  transaction: WorkerTransaction,
  payload: { organizationId: string; appId: string },
): Promise<boolean> {
  const candidates = await transaction
    .select({ id: reviews.id })
    .from(reviews)
    .leftJoin(reviewAnalyses, eq(reviewAnalyses.reviewId, reviews.id))
    .where(
      and(
        eq(reviews.appId, payload.appId),
        eq(reviews.organizationId, payload.organizationId),
        or(
          inArray(reviews.analysisStatus, ['pending', 'processing']),
          and(
            eq(reviews.analysisStatus, 'completed'),
            eq(reviewAnalyses.criteriaVersion, reviewAnalysisCriteriaVersion),
            eq(reviewAnalyses.uncovered, true),
            isNull(reviewAnalyses.discoveredAt),
          ),
        ),
      ),
    )
    .limit(1)
  return candidates.length > 0
}

function deduplicateTopicProposals(
  proposals: Array<{ label: string; description: string }>,
  topics: Array<{ label: string; aliases: string[] }>,
): Array<{ label: string; description: string }> {
  const knownLabels = new Set<string>()
  for (const topic of topics) {
    knownLabels.add(normalizeTopicLabel(topic.label))
    for (const alias of topic.aliases) {
      knownLabels.add(normalizeTopicLabel(alias))
    }
  }
  return proposals.filter((proposal) => {
    const normalized = normalizeTopicLabel(proposal.label)
    if (normalized.length === 0 || knownLabels.has(normalized)) {
      return false
    }
    knownLabels.add(normalized)
    return true
  })
}

export async function persistDiscoveryResults(
  database: Database,
  payload: { organizationId: string; appId: string },
  context: DiscoveryContext,
  newProposals: Array<{ label: string; description: string }>,
): Promise<void> {
  await database.transaction((transaction) =>
    persistDiscoveryResultsTransaction(transaction, payload, context, newProposals),
  )
}

type WorkerTransaction = Parameters<Parameters<Database['transaction']>[0]>[0]

async function persistDiscoveryResultsTransaction(
  transaction: WorkerTransaction,
  payload: { organizationId: string; appId: string },
  context: DiscoveryContext,
  newProposals: Array<{ label: string; description: string }>,
): Promise<void> {
  const [lockedApp] = await transaction
    .select({
      lastTopicDiscoveryAt: apps.lastTopicDiscoveryAt,
      topicDiscoveryRequestedAt: apps.topicDiscoveryRequestedAt,
    })
    .from(apps)
    .where(and(eq(apps.id, context.app.id), eq(apps.organizationId, payload.organizationId)))
    .for('update')
    .limit(1)
  if (
    lockedApp === undefined
    || lockedApp.lastTopicDiscoveryAt?.getTime() !== context.app.lastTopicDiscoveryAt?.getTime()
    || lockedApp.topicDiscoveryRequestedAt?.getTime()
      !== context.app.topicDiscoveryRequestedAt?.getTime()
  ) {
    throw new Error('topic_discovery_request_stale')
  }
  await assertDiscoveryCandidatesCurrent(transaction, payload, context)
  await insertFreshTopics(transaction, payload, context, newProposals)
  const now = new Date()
  await markDiscoveryReviews(transaction, context)
  await transaction
    .update(apps)
    .set({ lastTopicDiscoveryAt: now, topicDiscoveryRequestedAt: null })
    .where(eq(apps.id, context.app.id))
  await transaction
    .insert(usageEvents)
    .values({
      organizationId: payload.organizationId,
      type: 'managed_ai_topic_discovery',
      quantity: context.uncovered.length,
      occurredAt: now,
    })
}

async function insertFreshTopics(
  transaction: WorkerTransaction,
  payload: { organizationId: string; appId: string },
  context: DiscoveryContext,
  proposals: Array<{ label: string; description: string }>,
): Promise<void> {
  const currentTopics = await transaction
    .select({ label: reviewTopics.label, aliases: reviewTopics.aliases })
    .from(reviewTopics)
    .where(
      and(
        eq(reviewTopics.appId, context.app.id),
        eq(reviewTopics.organizationId, payload.organizationId),
      ),
    )
  const currentProposals = deduplicateTopicProposals(proposals, currentTopics)
  await Promise.all(
    currentProposals.map((proposal) =>
      insertDiscoveryTopic(transaction, payload, context, proposal),
    ),
  )
}

async function assertDiscoveryCandidatesCurrent(
  transaction: WorkerTransaction,
  payload: { organizationId: string; appId: string },
  context: DiscoveryContext,
): Promise<void> {
  const candidateIds = context.uncovered.map((candidate) => candidate.id)
  const currentCandidates = await loadCurrentDiscoveryCandidates(transaction, payload, candidateIds)
  const currentById = new Map(currentCandidates.map((candidate) => [candidate.id, candidate]))
  const allCurrent = context.uncovered.every((candidate) =>
    isDiscoveryCandidateCurrent(currentById.get(candidate.id), candidate),
  )
  if (!allCurrent) {
    throw new Error('topic_discovery_candidates_stale')
  }
}

type CurrentDiscoveryCandidate = {
  id: string
  title: string | null
  body: string
  rating: number
  version: string | null
  language: string | null
  analysisStatus: string
  analysisInputHash: string
  analysisAnalyzedAt: Date
  criteriaVersion: string
  uncovered: boolean
  discoveredAt: Date | null
}

function loadCurrentDiscoveryCandidates(
  transaction: WorkerTransaction,
  payload: { organizationId: string; appId: string },
  candidateIds: string[],
) {
  return transaction
    .select({
      id: reviews.id,
      title: reviews.title,
      body: reviews.body,
      rating: reviews.rating,
      version: reviews.version,
      language: reviews.language,
      analysisStatus: reviews.analysisStatus,
      analysisInputHash: reviewAnalyses.inputHash,
      analysisAnalyzedAt: reviewAnalyses.analyzedAt,
      criteriaVersion: reviewAnalyses.criteriaVersion,
      uncovered: reviewAnalyses.uncovered,
      discoveredAt: reviewAnalyses.discoveredAt,
    })
    .from(reviews)
    .innerJoin(reviewAnalyses, eq(reviewAnalyses.reviewId, reviews.id))
    .where(
      and(
        inArray(reviews.id, candidateIds),
        eq(reviews.organizationId, payload.organizationId),
        eq(reviews.appId, payload.appId),
      ),
    )
    .for('update')
}

function isDiscoveryCandidateCurrent(
  current: CurrentDiscoveryCandidate | undefined,
  candidate: DiscoveryContext['uncovered'][number],
): boolean {
  return (
    current !== undefined
    && current.analysisStatus === 'completed'
    && current.criteriaVersion === reviewAnalysisCriteriaVersion
    && current.uncovered
    && current.discoveredAt === null
    && current.analysisInputHash === candidate.analysisInputHash
    && current.analysisAnalyzedAt.getTime() === candidate.analysisAnalyzedAt.getTime()
    && getReviewAnalysisInputHash(current) === candidate.analysisInputHash
  )
}

async function markDiscoveryReviews(
  transaction: WorkerTransaction,
  context: DiscoveryContext,
): Promise<void> {
  await transaction
    .update(reviewAnalyses)
    .set({ discoveredAt: new Date() })
    .where(
      inArray(
        reviewAnalyses.reviewId,
        context.uncovered.map((review) => review.id),
      ),
    )
}

function insertDiscoveryTopic(
  transaction: WorkerTransaction,
  payload: { organizationId: string; appId: string },
  context: DiscoveryContext,
  proposal: { label: string; description: string },
) {
  return transaction
    .insert(reviewTopics)
    .values({
      organizationId: payload.organizationId,
      appId: context.app.id,
      label: proposal.label,
      normalizedLabel: normalizeTopicLabel(proposal.label),
      description: proposal.description,
      aliases: [],
      status: 'pending',
      origin: 'ai',
    })
    .onConflictDoNothing({ target: [reviewTopics.appId, reviewTopics.normalizedLabel] })
    .returning({ id: reviewTopics.id })
}

function normalizeTopicLabel(label: string): string {
  return label.trim().toLocaleLowerCase('en-US').replaceAll(/\s+/gu, ' ')
}

function boundDiscoveryTopics(
  topics: Array<{ label: string; description: string; aliases: string[] }>,
) {
  let characters = 0
  return topics.filter((topic) => {
    const size = topic.label.length + topic.description.length + topic.aliases.join('').length
    if (characters + size > topicDiscoveryCatalogueCharacterLimit) {
      return false
    }
    characters += size
    return true
  })
}
