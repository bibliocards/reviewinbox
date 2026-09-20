import { createHash } from 'node:crypto'

import { noul, score, TypeSafeClient } from '@typesafe-ai/sdk'
import type { Questions, SystemOneRequest, TypeSafeClientConfig } from '@typesafe-ai/sdk'
import { z } from 'zod'

export const reviewAnalysisCriteriaVersion = 'review-analysis-v1'

export const reviewIntentCodes = [
  'report_problem',
  'request_feature',
  'request_help',
  'request_refund',
  'express_satisfaction',
  'express_dissatisfaction',
] as const

export type ReviewIntentCode = (typeof reviewIntentCodes)[number]

export const reviewSeverityCodes = ['none', 'minor', 'degraded', 'blocking', 'critical'] as const

export type ReviewSeverityCode = (typeof reviewSeverityCodes)[number]

export type ReviewTopicForClassification = {
  id: string
  label: string
  description: string
  validationStatus: 'pending' | 'approved' | 'rejected'
  mergedIntoId?: string | null
}

export type ReviewClassificationInput = {
  title: string | null | undefined
  body: string
  rating: number
  language: string | null | undefined
  topics: readonly ReviewTopicForClassification[]
}

export type ReviewAnalysisHashInput = {
  title: string | null
  body: string
  rating: number
  version: string | null
  language: string | null
}

export type ReviewIntentClassification = { code: ReviewIntentCode; probability: number }

export type ReviewSeverityClassification = {
  code: ReviewSeverityCode | null
  score: number
  confidence: number
  probabilities: Readonly<Record<string, number>>
}

export type ReviewClassificationResult = {
  model: string
  intents: ReviewIntentClassification[]
  severity: ReviewSeverityClassification
  topicMatches: Array<{ topicId: string; probability: number }>
  catalogueGapProbability: number
  usage: { inputTokens: number; outputTokens: number }
}

export type TypeSafeReviewClassifierClient = {
  systemOne(request: SystemOneRequest): Promise<TypeSafeSystemOneResponse>
}

export type TypeSafeReviewClassifierOptions = {
  apiKey?: string
  model?: string
  client?: TypeSafeReviewClassifierClient
}

export type TypeSafeReviewClassifier = {
  classify(input: ReviewClassificationInput): Promise<ReviewClassificationResult>
}

const defaultModel = 'jev-latest'
const maxReviewStateCharacters = 12_000
const maxClassificationTopics = 100
const maxTopicCriteriaCharacters = 12_000

const intentInstructions: Record<ReviewIntentCode, string> = {
  report_problem: 'The review reports a defect, malfunction, outage, or product problem.',
  request_feature: 'The reviewer asks for a new feature, capability, or product change.',
  request_help: 'The reviewer asks for help, instructions, or support using the existing product.',
  request_refund: 'The reviewer asks to receive money back, cancel a charge, or be reimbursed.',
  express_satisfaction: 'The review expresses positive satisfaction, praise, or approval.',
  express_dissatisfaction: 'The review expresses dissatisfaction, frustration, or disappointment.',
}

const severityCriteria = [
  'No problem is described; this is praise, a neutral statement, or a suggestion without an impact claim.',
  'A minor inconvenience is described, but the main use remains available.',
  'A product capability is degraded, but the reviewer can still use the main product.',
  'The reviewer says that a main use is blocked or impossible, with no usable workaround described.',
  'The reviewer reports data loss or financial harm caused by the product.',
] as const

export function createTypeSafeReviewClassifier(
  options: TypeSafeReviewClassifierOptions = {},
): TypeSafeReviewClassifier {
  const rawClient = options.client ?? createDefaultTypeSafeClient(options)
  const client: TypeSafeReviewClassifierClient = options.client ?? {
    systemOne: async (request) => systemOneResponseSchema.parse(await rawClient.systemOne(request)),
  }

  return { classify: (input) => classifyReview(client, input, options.model ?? defaultModel) }
}

function createDefaultTypeSafeClient(options: TypeSafeReviewClassifierOptions) {
  const config: TypeSafeClientConfig = {
    defaultModel: options.model ?? defaultModel,
    timeout: 30_000,
    retry: { maxRetries: 0 },
  }
  if (options.apiKey !== undefined) {
    config.apiKey = options.apiKey
  }
  return new TypeSafeClient(config)
}

async function classifyReview(
  client: TypeSafeReviewClassifierClient,
  input: ReviewClassificationInput,
  model: string,
): Promise<ReviewClassificationResult> {
  const topicChunks = splitClassificationTopics(input.topics)
  const responses = await runClassificationChunks({ client, input, model, topicChunks })
  const classifications = responses.map((response, index) =>
    parseClassificationResult(response, topicChunks[index] ?? []),
  )
  const first = classifications[0]
  if (first === undefined) {
    throw new Error('Classification returned no result.')
  }
  return {
    ...first,
    topicMatches: classifications.flatMap((classification) => classification.topicMatches),
    catalogueGapProbability: Math.min(
      ...classifications.map((classification) => classification.catalogueGapProbability),
    ),
    usage: classifications.reduce(
      (usage, classification) => ({
        inputTokens: usage.inputTokens + classification.usage.inputTokens,
        outputTokens: usage.outputTokens + classification.usage.outputTokens,
      }),
      { inputTokens: 0, outputTokens: 0 },
    ),
  }
}

async function runClassificationChunks(context: {
  client: TypeSafeReviewClassifierClient
  input: ReviewClassificationInput
  model: string
  topicChunks: readonly (readonly ReviewTopicForClassification[])[]
  index?: number
  responses?: TypeSafeSystemOneResponse[]
}): Promise<TypeSafeSystemOneResponse[]> {
  const index = context.index ?? 0
  const responses = context.responses ?? []
  const topics = context.topicChunks[index]
  if (topics === undefined) {
    return responses
  }
  const response = await context.client.systemOne(
    buildClassificationRequest(context.input, context.model, topics),
  )
  return runClassificationChunks({
    ...context,
    index: index + 1,
    responses: [...responses, response],
  })
}

function buildClassificationRequest(
  input: ReviewClassificationInput,
  model: string,
  activeTopics: readonly ReviewTopicForClassification[],
): SystemOneRequest {
  return {
    state: {
      untrustedReview: {
        title: (input.title ?? '').slice(0, 500) || null,
        body: input.body.slice(0, maxReviewStateCharacters),
        rating: input.rating,
        language: input.language ?? null,
      },
      activeTopics: activeTopics.map(({ id, label, description }) => ({ id, label, description })),
    },
    questions: buildClassificationQuestions(activeTopics),
    model,
  }
}

function splitClassificationTopics(
  topics: readonly ReviewTopicForClassification[],
): ReviewTopicForClassification[][] {
  const builder: TopicChunkBuilder = { chunks: [], current: [], characters: 0 }
  for (const topic of orderClassificationTopics(topics)) {
    appendTopicToChunks(builder, topic)
  }
  if (builder.current.length > 0 || builder.chunks.length === 0) {
    builder.chunks.push(builder.current)
  }
  return builder.chunks
}

type TopicChunkBuilder = {
  chunks: ReviewTopicForClassification[][]
  current: ReviewTopicForClassification[]
  characters: number
}

function appendTopicToChunks(
  builder: TopicChunkBuilder,
  topic: ReviewTopicForClassification,
): void {
  const topicCharacters = topic.label.length + topic.description.length
  if (
    builder.current.length > 0
    && (builder.current.length >= maxClassificationTopics
      || builder.characters + topicCharacters > maxTopicCriteriaCharacters)
  ) {
    builder.chunks.push(builder.current)
    builder.current = []
    builder.characters = 0
  }
  const boundedTopic =
    topicCharacters > maxTopicCriteriaCharacters
      ? boundTopicCriteria(topic, maxTopicCriteriaCharacters)
      : topic
  builder.current.push(boundedTopic)
  builder.characters += boundedTopic.label.length + boundedTopic.description.length
}

function boundTopicCriteria(
  topic: ReviewTopicForClassification,
  characterLimit: number,
): ReviewTopicForClassification {
  const limit = Math.max(1, characterLimit)
  const label = topic.label.slice(0, Math.max(1, Math.min(topic.label.length, limit)))
  return {
    ...topic,
    label,
    description: topic.description.slice(0, Math.max(0, limit - label.length)),
  }
}

function orderClassificationTopics(
  topics: readonly ReviewTopicForClassification[],
): ReviewTopicForClassification[] {
  const activeTopics = topics.filter(
    (topic) =>
      topic.validationStatus !== 'rejected'
      && (topic.mergedIntoId === undefined || topic.mergedIntoId === null),
  )
  return activeTopics
    .filter((topic) => topic.validationStatus === 'approved')
    .concat(activeTopics.filter((topic) => topic.validationStatus === 'pending'))
}

function buildClassificationQuestions(
  activeTopics: readonly ReviewTopicForClassification[],
): Questions {
  const questions: Questions = {}

  for (const code of reviewIntentCodes) {
    questions[code] = noul(intentInstructions[code], {
      true: intentInstructions[code],
      false: `The review does not ${intentInstructions[code].replace(/^The review /u, '').toLowerCase()}`,
    })
  }
  questions['severity'] = score(
    'How severe is the problem described in this review?',
    severityCriteria,
  )

  for (const topic of activeTopics) {
    questions[topicQuestionKey(topic.id)] = noul(
      `Does this review discuss the app topic "${topic.label}"?`,
      { true: topic.description, false: 'The review does not discuss this topic.' },
    )
  }
  questions['catalogue_gap'] = noul(
    'Does this review describe a subject that the supplied topic catalogue does not adequately cover?',
    {
      true: 'No supplied topic adequately describes the main subject of the review.',
      false: 'At least one supplied topic adequately describes the main subject of the review.',
    },
  )

  return questions
}

function parseClassificationResult(
  response: TypeSafeSystemOneResponse,
  activeTopics: readonly ReviewTopicForClassification[],
): ReviewClassificationResult {
  const answers = response.answers
  const severityAnswer = asScoreAnswer(requiredAnswer(answers, 'severity'))
  const topicMatches = activeTopics.map((topic) => ({
    topicId: topic.id,
    probability: asNoulAnswer(requiredAnswer(answers, topicQuestionKey(topic.id))),
  }))

  return {
    model: response.model,
    intents: reviewIntentCodes.map((code) => ({
      code,
      probability: asNoulAnswer(requiredAnswer(answers, code)),
    })),
    severity: {
      code: severityCodeFromAnswer(severityAnswer),
      score: severityAnswer.score,
      confidence: severityAnswer.confidence,
      probabilities: severityAnswer.probabilities,
    },
    topicMatches,
    catalogueGapProbability: asNoulAnswer(requiredAnswer(answers, 'catalogue_gap')),
    usage: {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    },
  }
}

export function topicQuestionKey(topicId: string): string {
  return `topic_${topicId.replaceAll(/[^a-zA-Z0-9_]/gu, '_')}`
}

export function getReviewAnalysisInputHash(input: ReviewAnalysisHashInput): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        title: input.title,
        body: input.body,
        rating: input.rating,
        version: input.version,
        language: input.language,
      }),
    )
    .digest('hex')
}

export function severityCodeFromScore(severityScore: number): ReviewSeverityCode {
  const index = Math.round(severityScore)
  const code = reviewSeverityCodes[Math.max(0, Math.min(reviewSeverityCodes.length - 1, index))]
  if (code === undefined) {
    throw new Error('Severity score is outside the supported range.')
  }
  return code
}

function severityCodeFromAnswer(answer: {
  score: number
  confidence: number
  probabilities: Readonly<Record<string, number>>
}): ReviewSeverityCode | null {
  const entries = Object.entries(answer.probabilities)
    .map(([key, probability]) => ({ index: Number(key), probability }))
    .filter(({ index, probability }) => Number.isInteger(index) && Number.isFinite(probability))
  const [highest, second] = findTopTwoProbabilities(entries)
  if (highest === undefined || isAmbiguousSeverity(highest, second)) {
    return null
  }
  return reviewSeverityCodes[highest.index] ?? null
}

function findTopTwoProbabilities(
  entries: Array<{ index: number; probability: number }>,
): [
  { index: number; probability: number } | undefined,
  { index: number; probability: number } | undefined,
] {
  let highest: { index: number; probability: number } | undefined
  let second: { index: number; probability: number } | undefined
  for (const entry of entries) {
    if (highest === undefined || entry.probability > highest.probability) {
      second = highest
      highest = entry
    } else if (second === undefined || entry.probability > second.probability) {
      second = entry
    }
  }
  return [highest, second]
}

function isAmbiguousSeverity(
  highest: { probability: number },
  second: { probability: number } | undefined,
): boolean {
  return (
    highest.probability < 0.5
    || (second !== undefined && highest.probability - second.probability < 0.1)
  )
}

const noulAnswerSchema = z.object({ type: z.literal('noul'), noul: z.number().min(0).max(1) })
const scoreAnswerSchema = z.object({
  type: z.literal('score'),
  score: z.number(),
  confidence: z.number().min(0).max(1),
  probabilities: z.record(z.string(), z.number().min(0).max(1)),
})
const classificationAnswerSchema = z.discriminatedUnion('type', [
  noulAnswerSchema,
  scoreAnswerSchema,
])
const systemOneResponseSchema = z.object({
  model: z.string(),
  answers: z.record(z.string(), classificationAnswerSchema),
  usage: z
    .object({
      input_tokens: z.number().int().nonnegative(),
      output_tokens: z.number().int().nonnegative(),
    })
    .optional(),
})
type TypeSafeSystemOneResponse = z.infer<typeof systemOneResponseSchema>
type NoulAnswer = z.infer<typeof noulAnswerSchema>
type ScoreAnswer = z.infer<typeof scoreAnswerSchema>

type ClassificationAnswer = NoulAnswer | ScoreAnswer

function requiredAnswer(
  answers: Readonly<Record<string, ClassificationAnswer>>,
  key: string,
): ClassificationAnswer {
  const answer = answers[key]
  if (answer === undefined) {
    throw new Error(`TypeSafe response is missing the ${key} answer.`)
  }
  return answer
}

function asNoulAnswer(answer: ClassificationAnswer): number {
  if (answer.type !== 'noul') {
    throw new Error('TypeSafe returned an invalid boolean classification answer.')
  }
  return answer.noul
}

function asScoreAnswer(answer: ClassificationAnswer): ScoreAnswer {
  if (answer.type !== 'score') {
    throw new Error('TypeSafe returned an invalid severity classification answer.')
  }
  return answer
}
