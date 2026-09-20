import {
  createTypeSafeReviewClassifier,
  getReviewAnalysisInputHash,
  type ReviewClassificationResult,
  type ReviewTopicForClassification,
  type TypeSafeReviewClassifier,
} from '@reviewinbox/ai'
import {
  apps,
  reviewAnalyses,
  reviewTopicAssignments,
  reviewTopics,
  reviews,
  usageEvents,
  type Database,
} from '@reviewinbox/db'
import { and, eq } from 'drizzle-orm'

export const reviewAnalysisCriteriaVersion = 'review-analysis-v1'
export const classificationProbabilityThreshold = 0.5

export type ReviewAnalysisWorkerOptions = {
  database: Database
  classifier: TypeSafeReviewClassifier
  now?: () => Date
}

export type ReviewAnalysisResult =
  | { status: 'completed'; reviewId: string; uncovered: boolean }
  | { status: 'skipped'; reviewId: string; reason: 'empty_body' | 'not_found' | 'stale' }
  | { status: 'unchanged'; reviewId: string }

type ReviewForAnalysis = {
  id: string
  organizationId: string
  appId: string
  title: string | null
  body: string
  rating: number
  version: string | null
  language: string | null
  analysisStatus: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped'
}

type PersistClassificationInput = {
  database: Database
  review: Pick<ReviewForAnalysis, 'id' | 'organizationId' | 'appId'>
  catalogVersion: number
  inputHash: string
  analysisAnalyzedAt: Date | null
  classification: ReviewClassificationResult
  now: () => Date
}

export async function classifyReviewForAnalysis(
  options: ReviewAnalysisWorkerOptions,
  input: { organizationId: string; reviewId: string },
): Promise<ReviewAnalysisResult> {
  const now = options.now ?? (() => new Date())
  const review = await loadReview(options.database, input)

  if (review === undefined) {
    return { status: 'skipped', reviewId: input.reviewId, reason: 'not_found' }
  }

  if (isEmptyReview(review)) {
    const skipped = await markEmptyReviewSkipped(options.database, review)
    return { status: 'skipped', reviewId: review.id, reason: skipped ? 'empty_body' : 'stale' }
  }

  const app = await loadApp(options.database, review)
  if (app === undefined) {
    return { status: 'skipped', reviewId: review.id, reason: 'not_found' }
  }

  return classifyLoadedReview(options, review, app.catalogVersion, now)
}

async function classifyLoadedReview(
  options: ReviewAnalysisWorkerOptions,
  review: ReviewForAnalysis,
  catalogVersion: number,
  now: () => Date,
): Promise<ReviewAnalysisResult> {
  const inputHash = getReviewAnalysisInputHash({
    title: review.title,
    body: review.body,
    rating: review.rating,
    version: review.version,
    language: review.language,
  })
  const existingAnalysis = await loadExistingAnalysis(options.database, review.id)
  if (isAnalysisCurrent(review, catalogVersion, inputHash, existingAnalysis)) {
    return { status: 'unchanged', reviewId: review.id }
  }
  await markReviewProcessing(options.database, review.id, now())

  try {
    return await runReviewClassification(options, {
      review,
      catalogVersion,
      inputHash,
      analysisAnalyzedAt: existingAnalysis?.analyzedAt ?? null,
      now,
    })
  } catch (error) {
    await markReviewFailed(
      options.database,
      review,
      inputHash,
      error instanceof Error ? error : new Error('classification_failed'),
    )
    throw error
  }
}

async function runReviewClassification(
  options: ReviewAnalysisWorkerOptions,
  context: {
    review: ReviewForAnalysis
    catalogVersion: number
    inputHash: string
    analysisAnalyzedAt: Date | null
    now: () => Date
  },
): Promise<ReviewAnalysisResult> {
  const { review, catalogVersion, inputHash, analysisAnalyzedAt, now } = context
  const topics = await loadTopics(options.database, review)
  const classification = await options.classifier.classify({
    title: review.title,
    body: review.body,
    rating: review.rating,
    language: review.language,
    topics: topics.map((topic) => toClassifierTopic(topic)),
  })
  if (!(await isReviewSourceCurrent(options.database, review, inputHash))) {
    await markReviewPending(options.database, review.id)
    return { status: 'skipped', reviewId: review.id, reason: 'stale' }
  }
  const persisted = await persistClassification({
    database: options.database,
    review,
    catalogVersion,
    inputHash,
    analysisAnalyzedAt,
    classification,
    now,
  })
  if (!persisted) {
    return { status: 'skipped', reviewId: review.id, reason: 'stale' }
  }
  return {
    status: 'completed',
    reviewId: review.id,
    uncovered: classification.catalogueGapProbability >= classificationProbabilityThreshold,
  }
}

async function loadReview(
  database: Database,
  input: { organizationId: string; reviewId: string },
): Promise<ReviewForAnalysis | undefined> {
  const [review] = await database
    .select({
      id: reviews.id,
      organizationId: reviews.organizationId,
      appId: reviews.appId,
      title: reviews.title,
      body: reviews.body,
      rating: reviews.rating,
      version: reviews.version,
      language: reviews.language,
      analysisStatus: reviews.analysisStatus,
    })
    .from(reviews)
    .where(and(eq(reviews.id, input.reviewId), eq(reviews.organizationId, input.organizationId)))
    .limit(1)
  return review
}

async function loadApp(
  database: Database,
  review: Pick<ReviewForAnalysis, 'appId' | 'organizationId'>,
): Promise<{ catalogVersion: number } | undefined> {
  const [app] = await database
    .select({ catalogVersion: apps.analysisCatalogVersion })
    .from(apps)
    .where(and(eq(apps.id, review.appId), eq(apps.organizationId, review.organizationId)))
    .limit(1)
  return app
}

function loadTopics(
  database: Database,
  review: Pick<ReviewForAnalysis, 'appId' | 'organizationId'>,
) {
  return database
    .select({
      id: reviewTopics.id,
      label: reviewTopics.label,
      description: reviewTopics.description,
      status: reviewTopics.status,
      mergedIntoId: reviewTopics.mergedIntoId,
    })
    .from(reviewTopics)
    .where(
      and(
        eq(reviewTopics.appId, review.appId),
        eq(reviewTopics.organizationId, review.organizationId),
      ),
    )
}

type ExistingAnalysis = {
  inputHash: string
  catalogVersion: number
  criteriaVersion: string
  analyzedAt: Date
}

async function loadExistingAnalysis(
  database: Database,
  reviewId: string,
): Promise<ExistingAnalysis | undefined> {
  const [existing] = await database
    .select({
      inputHash: reviewAnalyses.inputHash,
      catalogVersion: reviewAnalyses.catalogVersion,
      criteriaVersion: reviewAnalyses.criteriaVersion,
      analyzedAt: reviewAnalyses.analyzedAt,
    })
    .from(reviewAnalyses)
    .where(eq(reviewAnalyses.reviewId, reviewId))
    .limit(1)
  return existing
}

function isAnalysisCurrent(
  review: Pick<ReviewForAnalysis, 'analysisStatus'>,
  catalogVersion: number,
  inputHash: string,
  existing: ExistingAnalysis | undefined,
): boolean {
  return (
    existing?.inputHash === inputHash
    && existing.catalogVersion === catalogVersion
    && existing.criteriaVersion === reviewAnalysisCriteriaVersion
    && review.analysisStatus === 'completed'
  )
}

async function isReviewSourceCurrent(
  database: Database,
  review: Pick<ReviewForAnalysis, 'id'>,
  inputHash: string,
): Promise<boolean> {
  const [latestReview] = await database
    .select({
      title: reviews.title,
      body: reviews.body,
      rating: reviews.rating,
      version: reviews.version,
      language: reviews.language,
    })
    .from(reviews)
    .where(eq(reviews.id, review.id))
    .limit(1)
  return latestReview !== undefined && getReviewAnalysisInputHash(latestReview) === inputHash
}

function isEmptyReview(review: Pick<ReviewForAnalysis, 'title' | 'body'>): boolean {
  return review.body.trim().length === 0 && (review.title ?? '').trim().length === 0
}

function markEmptyReviewSkipped(database: Database, review: ReviewForAnalysis): Promise<boolean> {
  return skipEmptyReviewIfUnchanged(database, {
    organizationId: review.organizationId,
    appId: review.appId,
    reviewId: review.id,
    expectedInputHash: getReviewAnalysisInputHash(review),
  })
}

export function skipEmptyReviewIfUnchanged(
  database: Database,
  input: { organizationId: string; appId: string; reviewId: string; expectedInputHash: string },
): Promise<boolean> {
  return database.transaction(async (transaction) => {
    const [lockedApp] = await transaction
      .select({ id: apps.id })
      .from(apps)
      .where(and(eq(apps.id, input.appId), eq(apps.organizationId, input.organizationId)))
      .for('update')
      .limit(1)
    if (lockedApp === undefined) {
      return false
    }
    const [current] = await transaction
      .select({
        title: reviews.title,
        body: reviews.body,
        rating: reviews.rating,
        version: reviews.version,
        language: reviews.language,
        analysisStatus: reviews.analysisStatus,
      })
      .from(reviews)
      .where(and(eq(reviews.id, input.reviewId), eq(reviews.organizationId, input.organizationId)))
      .for('update')
      .limit(1)
    if (
      current === undefined
      || getReviewAnalysisInputHash(current) !== input.expectedInputHash
      || !isEmptyReview(current)
      || (current.analysisStatus !== 'pending' && current.analysisStatus !== 'skipped')
    ) {
      return false
    }
    await transaction
      .update(reviews)
      .set({
        analysisStatus: 'skipped',
        analysisFailureCode: 'empty_body',
        analysisStartedAt: null,
      })
      .where(eq(reviews.id, input.reviewId))
    return true
  })
}

async function markReviewProcessing(
  database: Database,
  reviewId: string,
  now: Date,
): Promise<void> {
  await database
    .update(reviews)
    .set({ analysisStatus: 'processing', analysisStartedAt: now, analysisFailureCode: null })
    .where(eq(reviews.id, reviewId))
}

async function markReviewPending(database: Database, reviewId: string): Promise<void> {
  await database
    .update(reviews)
    .set({ analysisStatus: 'pending', analysisStartedAt: null })
    .where(and(eq(reviews.id, reviewId), eq(reviews.analysisStatus, 'processing')))
}

async function markReviewFailed(
  database: Database,
  review: Pick<ReviewForAnalysis, 'id' | 'organizationId' | 'appId'>,
  inputHash: string,
  error: Error,
): Promise<void> {
  await database.transaction(async (transaction) => {
    await transaction
      .select({ id: apps.id })
      .from(apps)
      .where(and(eq(apps.id, review.appId), eq(apps.organizationId, review.organizationId)))
      .for('update')
      .limit(1)
    const [current] = await transaction
      .select({
        title: reviews.title,
        body: reviews.body,
        rating: reviews.rating,
        version: reviews.version,
        language: reviews.language,
        analysisStatus: reviews.analysisStatus,
      })
      .from(reviews)
      .where(and(eq(reviews.id, review.id), eq(reviews.organizationId, review.organizationId)))
      .for('update')
      .limit(1)
    if (
      current === undefined
      || current.analysisStatus !== 'processing'
      || getReviewAnalysisInputHash(current) !== inputHash
    ) {
      await transaction
        .update(reviews)
        .set({ analysisStatus: 'pending', analysisStartedAt: null })
        .where(and(eq(reviews.id, review.id), eq(reviews.analysisStatus, 'processing')))
      return
    }
    await transaction
      .update(reviews)
      .set({
        analysisStatus: 'failed',
        analysisFailureCode: safeAnalysisFailureCode(error),
        analysisStartedAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(reviews.id, review.id), eq(reviews.analysisStatus, 'processing')))
  })
}

function persistClassification(input: PersistClassificationInput): Promise<boolean> {
  return input.database.transaction((transaction) =>
    persistClassificationTransaction(transaction, input),
  )
}

async function persistClassificationTransaction(
  transaction: Transaction,
  input: PersistClassificationInput,
): Promise<boolean> {
  const locked = await lockPersistenceRows(transaction, input)
  if (!locked.isCurrent) {
    await markTransactionReviewPending(transaction, input.review.id)
    return false
  }
  const probabilities = buildClassificationProbabilities(input.classification)
  const baseIntents = input.classification.intents
    .filter((item) => item.probability >= classificationProbabilityThreshold)
    .map((item) => item.code)
  const baseTopicMatches = input.classification.topicMatches.filter(
    (item) =>
      locked.activeTopicIds.has(item.topicId)
      && item.probability >= classificationProbabilityThreshold,
  )
  await upsertAnalysis(transaction, input, locked, { probabilities, baseIntents })
  await replaceTopicAssignments(transaction, input, baseTopicMatches)
  await completeAnalysis(transaction, input)
  return true
}

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

type LockedPersistenceRows = {
  isCurrent: boolean
  manualOverride: typeof reviewAnalyses.$inferSelect.manualOverride | null
  overrideInputHash: string | null
  inputHash: string | null
  discoveredAt: Date | null
  activeTopicIds: Set<string>
}

async function lockPersistenceRows(
  transaction: Transaction,
  input: PersistClassificationInput,
): Promise<LockedPersistenceRows> {
  const lockedSource = await lockSourceRows(transaction, input)
  const [current] = await transaction
    .select({
      manualOverride: reviewAnalyses.manualOverride,
      overrideInputHash: reviewAnalyses.overrideInputHash,
      inputHash: reviewAnalyses.inputHash,
      analyzedAt: reviewAnalyses.analyzedAt,
      discoveredAt: reviewAnalyses.discoveredAt,
    })
    .from(reviewAnalyses)
    .where(eq(reviewAnalyses.reviewId, input.review.id))
    .for('update')
    .limit(1)
  const activeTopics = await transaction
    .select({ id: reviewTopics.id, status: reviewTopics.status })
    .from(reviewTopics)
    .where(
      and(
        eq(reviewTopics.appId, input.review.appId),
        eq(reviewTopics.organizationId, input.review.organizationId),
      ),
    )
  const currentState = current ?? {
    manualOverride: null,
    overrideInputHash: null,
    inputHash: null,
    analyzedAt: null,
    discoveredAt: null,
  }
  return {
    isCurrent: isPersistenceCurrent(lockedSource, current, input),
    manualOverride: currentState.manualOverride,
    overrideInputHash: currentState.overrideInputHash,
    inputHash: currentState.inputHash,
    discoveredAt: currentState.discoveredAt,
    activeTopicIds: getActiveTopicIds(activeTopics),
  }
}

function isPersistenceCurrent(
  source: Awaited<ReturnType<typeof lockSourceRows>>,
  current: { analyzedAt: Date; inputHash: string } | undefined,
  input: PersistClassificationInput,
): boolean {
  const sourceCurrent =
    source.app?.catalogVersion === input.catalogVersion
    && source.review !== undefined
    && getReviewAnalysisInputHash(source.review) === input.inputHash
  const analysisCurrent =
    input.analysisAnalyzedAt === null
      ? current === undefined
      : current !== undefined && current.analyzedAt.getTime() === input.analysisAnalyzedAt.getTime()
  return sourceCurrent && analysisCurrent
}

function getActiveTopicIds(topics: Array<{ id: string; status: string }>): Set<string> {
  return new Set(topics.filter((topic) => topic.status !== 'rejected').map((topic) => topic.id))
}

async function lockSourceRows(
  transaction: Transaction,
  input: PersistClassificationInput,
): Promise<{
  app: { catalogVersion: number } | undefined
  review:
    | {
        title: string | null
        body: string
        rating: number
        version: string | null
        language: string | null
      }
    | undefined
}> {
  const [app] = await transaction
    .select({ catalogVersion: apps.analysisCatalogVersion })
    .from(apps)
    .where(
      and(eq(apps.id, input.review.appId), eq(apps.organizationId, input.review.organizationId)),
    )
    .for('update')
    .limit(1)
  const [review] = await transaction
    .select({
      title: reviews.title,
      body: reviews.body,
      rating: reviews.rating,
      version: reviews.version,
      language: reviews.language,
    })
    .from(reviews)
    .where(
      and(eq(reviews.id, input.review.id), eq(reviews.organizationId, input.review.organizationId)),
    )
    .for('update')
    .limit(1)
  return { app, review }
}

function buildClassificationProbabilities(classification: ReviewClassificationResult) {
  return {
    ...Object.fromEntries(
      classification.intents.map((item) => [`intent:${item.code}`, item.probability]),
    ),
    ...Object.fromEntries(
      classification.topicMatches.map((item) => [`topic:${item.topicId}`, item.probability]),
    ),
    'severity:score': classification.severity.score,
    'severity:confidence': classification.severity.confidence,
    catalogue_gap: classification.catalogueGapProbability,
  }
}

async function upsertAnalysis(
  transaction: Transaction,
  input: PersistClassificationInput,
  locked: LockedPersistenceRows,
  automatic: {
    probabilities: ReturnType<typeof buildClassificationProbabilities>
    baseIntents: Array<ReviewClassificationResult['intents'][number]['code']>
  },
): Promise<void> {
  const override = locked.manualOverride
  const overrideInputHash = override === null ? null : (locked.overrideInputHash ?? input.inputHash)
  const values = {
    reviewId: input.review.id,
    organizationId: input.review.organizationId,
    appId: input.review.appId,
    inputHash: input.inputHash,
    criteriaVersion: reviewAnalysisCriteriaVersion,
    catalogVersion: input.catalogVersion,
    model: input.classification.model,
    severity: input.classification.severity.code,
    intents: automatic.baseIntents,
    uncovered: input.classification.catalogueGapProbability >= classificationProbabilityThreshold,
    probabilities: automatic.probabilities,
    manualOverride: override,
    overrideInputHash,
    needsRecheck: override !== null && locked.overrideInputHash !== input.inputHash,
    discoveredAt: locked.inputHash === input.inputHash ? locked.discoveredAt : null,
    analyzedAt: input.now(),
  }
  await transaction
    .insert(reviewAnalyses)
    .values(values)
    .onConflictDoUpdate({ target: reviewAnalyses.reviewId, set: values })
}

async function replaceTopicAssignments(
  transaction: Transaction,
  input: PersistClassificationInput,
  baseTopicMatches: Array<{ topicId: string; probability: number }>,
): Promise<void> {
  await transaction
    .delete(reviewTopicAssignments)
    .where(eq(reviewTopicAssignments.reviewId, input.review.id))
  if (baseTopicMatches.length === 0) {
    return
  }
  await transaction
    .insert(reviewTopicAssignments)
    .values(
      baseTopicMatches.map(({ topicId, probability }) => ({
        reviewId: input.review.id,
        topicId,
        probability,
      })),
    )
}

async function completeAnalysis(
  transaction: Transaction,
  input: PersistClassificationInput,
): Promise<void> {
  await transaction
    .update(reviews)
    .set({ analysisStatus: 'completed', analysisStartedAt: null, analysisFailureCode: null })
    .where(eq(reviews.id, input.review.id))
  await transaction
    .insert(usageEvents)
    .values({
      organizationId: input.review.organizationId,
      type: 'managed_ai_review_classified',
      quantity: 1,
      occurredAt: input.now(),
    })
}

async function markTransactionReviewPending(
  transaction: Transaction,
  reviewId: string,
): Promise<void> {
  await transaction
    .update(reviews)
    .set({ analysisStatus: 'pending', analysisStartedAt: null })
    .where(and(eq(reviews.id, reviewId), eq(reviews.analysisStatus, 'processing')))
}

function toClassifierTopic(topic: {
  id: string
  label: string
  description: string
  status: 'pending' | 'approved' | 'rejected'
  mergedIntoId: string | null
}): ReviewTopicForClassification {
  return {
    id: topic.id,
    label: topic.label,
    description: topic.description,
    validationStatus: topic.status,
    mergedIntoId: topic.mergedIntoId,
  }
}

function safeAnalysisFailureCode(error: Error): string {
  if (error.name.length > 0) {
    return error.name.slice(0, 100)
  }
  return 'classification_failed'
}

export function createTypeSafeClassifier(
  apiKey: string | undefined,
): TypeSafeReviewClassifier | null {
  if (apiKey === undefined || apiKey.trim().length === 0) {
    return null
  }
  return createTypeSafeReviewClassifier({ apiKey })
}
