import type { Job, SendOptions, WorkOptions } from 'pg-boss'
import { PgBoss } from 'pg-boss'
import { z } from 'zod'

export const generateReplyDraftJobName = 'generate-reply-draft'
export const syncStoreConnectionJobName = 'sync-store-connection'
export const classifyReviewJobName = 'classify-review'
export const discoverReviewTopicsJobName = 'discover-review-topics'

export const reviewInboxJobNames = [
  generateReplyDraftJobName,
  syncStoreConnectionJobName,
  classifyReviewJobName,
  discoverReviewTopicsJobName,
] as const

const generateReplyDraftJobPayloadSchema = z.object({
  organizationId: z.string().min(1),
  reviewId: z.uuid(),
})

const syncStoreConnectionJobPayloadSchema = z.object({
  organizationId: z.string().min(1),
  storeConnectionId: z.uuid(),
  windowStartsAt: z.iso.datetime(),
  trigger: z.enum(['automatic', 'initial']),
})
const classifyReviewJobPayloadSchema = z.object({
  organizationId: z.string().min(1),
  reviewId: z.uuid(),
})
const discoverReviewTopicsJobPayloadSchema = z.object({
  organizationId: z.string().min(1),
  appId: z.uuid(),
  trigger: z.enum(['daily', 'manual']),
})

export type GenerateReplyDraftJobPayload = z.infer<typeof generateReplyDraftJobPayloadSchema>
export type SyncStoreConnectionJobPayload = z.infer<typeof syncStoreConnectionJobPayloadSchema>
export type ClassifyReviewJobPayload = z.infer<typeof classifyReviewJobPayloadSchema>
export type DiscoverReviewTopicsJobPayload = z.infer<typeof discoverReviewTopicsJobPayloadSchema>

export type QueueJobOptions = { priority?: number; startAfter?: number | string | Date }

export type QueueJobHandler<TPayload> = (job: {
  id: string
  payload: TPayload
  signal: AbortSignal
}) => Promise<void>

export type QueueClient = {
  start(): Promise<void>
  stop(): Promise<void>
  enqueueGenerateReplyDraft(
    payload: GenerateReplyDraftJobPayload,
    options?: QueueJobOptions,
  ): Promise<string>
  enqueueSyncStoreConnection(
    payload: SyncStoreConnectionJobPayload,
    options?: QueueJobOptions,
  ): Promise<string | null>
  enqueueClassifyReview(
    payload: ClassifyReviewJobPayload,
    options?: QueueJobOptions,
  ): Promise<string>
  enqueueDiscoverReviewTopics(
    payload: DiscoverReviewTopicsJobPayload,
    options?: QueueJobOptions,
  ): Promise<string | null>
  workGenerateReplyDraft(handler: QueueJobHandler<GenerateReplyDraftJobPayload>): Promise<string>
  workSyncStoreConnection(handler: QueueJobHandler<SyncStoreConnectionJobPayload>): Promise<string>
  workClassifyReview(handler: QueueJobHandler<ClassifyReviewJobPayload>): Promise<string>
  workDiscoverReviewTopics(
    handler: QueueJobHandler<DiscoverReviewTopicsJobPayload>,
  ): Promise<string>
}

export type QueueClientOptions = {
  databaseUrl: string
  schema?: string
  onError?: (error: Error) => void
  boss?: QueueClientBoss
}

type QueuePayload =
  | GenerateReplyDraftJobPayload
  | SyncStoreConnectionJobPayload
  | ClassifyReviewJobPayload
  | DiscoverReviewTopicsJobPayload

type QueueCreationOptions = {
  retryLimit?: number
  retryDelay?: number
  retryBackoff?: boolean
  expireInSeconds?: number
}

export type QueueClientBoss = {
  on(event: 'error', listener: (error: Error) => void): QueueClientBoss
  start(): Promise<QueueClientBoss>
  stop(options?: { graceful?: boolean }): Promise<void>
  send(name: string, data: QueuePayload, options: SendOptions): Promise<string | null>
  work<TPayload>(
    name: string,
    options: WorkOptions,
    handler: (jobs: Job<TPayload>[]) => Promise<void>,
  ): Promise<string>
  createQueue(name: string, options?: QueueCreationOptions): Promise<void>
}

export function createQueueClient(options: QueueClientOptions): QueueClient {
  const boss =
    options.boss
    ?? new PgBoss({ connectionString: options.databaseUrl, schema: options.schema ?? 'pgboss' })

  if (options.onError) {
    boss.on('error', options.onError)
  }

  return createQueueClientMethods(boss)
}

function createQueueClientMethods(boss: QueueClientBoss): QueueClient {
  return {
    start: async () => {
      await boss.start()
      await ensureQueues(boss)
    },
    stop: () => boss.stop({ graceful: true }),
    enqueueGenerateReplyDraft: (payload, jobOptions) =>
      enqueueGenerateReplyDraft(boss, payload, jobOptions),
    enqueueSyncStoreConnection: (payload, jobOptions) =>
      enqueueSyncStoreConnection(boss, payload, jobOptions),
    enqueueClassifyReview: (payload, jobOptions) =>
      enqueueClassifyReview(boss, payload, jobOptions),
    enqueueDiscoverReviewTopics: (payload, jobOptions) =>
      enqueueDiscoverReviewTopics(boss, payload, jobOptions),
    workGenerateReplyDraft: (handler) => workGenerateReplyDraft(boss, handler),
    workSyncStoreConnection: (handler) => workSyncStoreConnection(boss, handler),
    workClassifyReview: (handler) => workClassifyReview(boss, handler),
    workDiscoverReviewTopics: (handler) => workDiscoverReviewTopics(boss, handler),
  }
}

async function enqueueGenerateReplyDraft(
  boss: QueueClientBoss,
  payload: GenerateReplyDraftJobPayload,
  jobOptions?: QueueJobOptions,
): Promise<string> {
  const parsedPayload = generateReplyDraftJobPayloadSchema.parse(payload)
  const jobId = await boss.send(generateReplyDraftJobName, parsedPayload, {
    ...defaultGenerateReplyDraftJobOptions,
    ...jobOptions,
    singletonKey: parsedPayload.reviewId,
  })

  if (jobId === null) {
    throw new Error('pg-boss did not create a generate-reply-draft job.')
  }

  return jobId
}

function enqueueSyncStoreConnection(
  boss: QueueClientBoss,
  payload: SyncStoreConnectionJobPayload,
  jobOptions?: QueueJobOptions,
): Promise<string | null> {
  return Promise.resolve().then(() => {
    const parsedPayload = syncStoreConnectionJobPayloadSchema.parse(payload)
    return boss.send(syncStoreConnectionJobName, parsedPayload, {
      ...defaultSyncStoreConnectionJobOptions,
      ...jobOptions,
      singletonKey: `${parsedPayload.windowStartsAt}:${parsedPayload.storeConnectionId}`,
    })
  })
}

async function enqueueClassifyReview(
  boss: QueueClientBoss,
  payload: ClassifyReviewJobPayload,
  jobOptions?: QueueJobOptions,
): Promise<string> {
  const parsedPayload = classifyReviewJobPayloadSchema.parse(payload)
  const jobId = await boss.send(classifyReviewJobName, parsedPayload, {
    ...defaultClassifyReviewJobOptions,
    ...jobOptions,
    singletonKey: parsedPayload.reviewId,
  })
  if (jobId === null) {
    throw new Error('pg-boss did not create a classify-review job.')
  }
  return jobId
}

function enqueueDiscoverReviewTopics(
  boss: QueueClientBoss,
  payload: DiscoverReviewTopicsJobPayload,
  jobOptions?: QueueJobOptions,
): Promise<string | null> {
  return Promise.resolve().then(() => {
    const parsedPayload = discoverReviewTopicsJobPayloadSchema.parse(payload)
    return boss.send(discoverReviewTopicsJobName, parsedPayload, {
      ...defaultDiscoverReviewTopicsJobOptions,
      ...jobOptions,
      singletonKey: parsedPayload.appId,
    })
  })
}

function workGenerateReplyDraft(
  boss: QueueClientBoss,
  handler: QueueJobHandler<GenerateReplyDraftJobPayload>,
): Promise<string> {
  return boss.work<GenerateReplyDraftJobPayload>(
    generateReplyDraftJobName,
    defaultGenerateReplyDraftWorkOptions,
    (jobs) => handleJobsSequentially(jobs, handler, parseGenerateReplyDraftJob),
  )
}

function workSyncStoreConnection(
  boss: QueueClientBoss,
  handler: QueueJobHandler<SyncStoreConnectionJobPayload>,
): Promise<string> {
  return boss.work<SyncStoreConnectionJobPayload>(
    syncStoreConnectionJobName,
    defaultSyncStoreConnectionWorkOptions,
    (jobs) => handleJobsSequentially(jobs, handler, parseSyncStoreConnectionJob),
  )
}

function workClassifyReview(
  boss: QueueClientBoss,
  handler: QueueJobHandler<ClassifyReviewJobPayload>,
): Promise<string> {
  return boss.work<ClassifyReviewJobPayload>(
    classifyReviewJobName,
    defaultClassifyReviewWorkOptions,
    (jobs) => handleJobsSequentially(jobs, handler, parseClassifyReviewJob),
  )
}

function workDiscoverReviewTopics(
  boss: QueueClientBoss,
  handler: QueueJobHandler<DiscoverReviewTopicsJobPayload>,
): Promise<string> {
  return boss.work<DiscoverReviewTopicsJobPayload>(
    discoverReviewTopicsJobName,
    defaultDiscoverReviewTopicsWorkOptions,
    (jobs) => handleJobsSequentially(jobs, handler, parseDiscoverReviewTopicsJob),
  )
}

async function handleJobsSequentially<TPayload>(
  jobs: Job<TPayload>[],
  handler: QueueJobHandler<TPayload>,
  parsePayload: (job: Job<TPayload>) => TPayload,
): Promise<void> {
  let sequence = Promise.resolve()
  for (const job of jobs) {
    sequence = sequence.then(() =>
      handler({ id: job.id, payload: parsePayload(job), signal: job.signal }),
    )
  }
  await sequence
}

const defaultGenerateReplyDraftJobOptions = {
  retryLimit: 3,
  retryDelay: 30,
  retryBackoff: true,
  expireInSeconds: 300,
  singletonSeconds: 60 * 60 * 24 * 7,
} satisfies SendOptions

const defaultGenerateReplyDraftWorkOptions = {
  batchSize: 1,
  pollingIntervalSeconds: 1,
} satisfies WorkOptions

const defaultSyncStoreConnectionJobOptions = {
  retryLimit: 0,
  expireInSeconds: 60 * 60 * 2,
  singletonSeconds: 60 * 60 * 24,
} satisfies SendOptions

const defaultSyncStoreConnectionWorkOptions = {
  batchSize: 1,
  pollingIntervalSeconds: 1,
} satisfies WorkOptions

const defaultClassifyReviewJobOptions = {
  retryLimit: 3,
  retryDelay: 30,
  retryBackoff: true,
  expireInSeconds: 300,
  singletonSeconds: 60,
} satisfies SendOptions

const defaultClassifyReviewWorkOptions = {
  batchSize: 1,
  pollingIntervalSeconds: 1,
} satisfies WorkOptions

const defaultDiscoverReviewTopicsJobOptions = {
  retryLimit: 2,
  retryDelay: 60,
  retryBackoff: true,
  expireInSeconds: 60 * 60,
  singletonSeconds: 60 * 60 * 24,
} satisfies SendOptions

const defaultDiscoverReviewTopicsWorkOptions = {
  batchSize: 1,
  pollingIntervalSeconds: 1,
} satisfies WorkOptions

async function ensureQueues(boss: QueueClientBoss): Promise<void> {
  await boss.createQueue(generateReplyDraftJobName, {
    retryLimit: defaultGenerateReplyDraftJobOptions.retryLimit,
    retryDelay: defaultGenerateReplyDraftJobOptions.retryDelay,
    retryBackoff: defaultGenerateReplyDraftJobOptions.retryBackoff,
    expireInSeconds: defaultGenerateReplyDraftJobOptions.expireInSeconds,
  })
  await boss.createQueue(syncStoreConnectionJobName, {
    retryLimit: defaultSyncStoreConnectionJobOptions.retryLimit,
    expireInSeconds: defaultSyncStoreConnectionJobOptions.expireInSeconds,
  })
  await boss.createQueue(classifyReviewJobName, {
    retryLimit: defaultClassifyReviewJobOptions.retryLimit,
    retryDelay: defaultClassifyReviewJobOptions.retryDelay,
    retryBackoff: defaultClassifyReviewJobOptions.retryBackoff,
    expireInSeconds: defaultClassifyReviewJobOptions.expireInSeconds,
  })
  await boss.createQueue(discoverReviewTopicsJobName, {
    retryLimit: defaultDiscoverReviewTopicsJobOptions.retryLimit,
    retryDelay: defaultDiscoverReviewTopicsJobOptions.retryDelay,
    retryBackoff: defaultDiscoverReviewTopicsJobOptions.retryBackoff,
    expireInSeconds: defaultDiscoverReviewTopicsJobOptions.expireInSeconds,
  })
}

function parseGenerateReplyDraftJob(
  job: Job<GenerateReplyDraftJobPayload>,
): GenerateReplyDraftJobPayload {
  return generateReplyDraftJobPayloadSchema.parse(job.data)
}

function parseSyncStoreConnectionJob(
  job: Job<SyncStoreConnectionJobPayload>,
): SyncStoreConnectionJobPayload {
  return syncStoreConnectionJobPayloadSchema.parse(job.data)
}

function parseClassifyReviewJob(job: Job<ClassifyReviewJobPayload>): ClassifyReviewJobPayload {
  return classifyReviewJobPayloadSchema.parse(job.data)
}

function parseDiscoverReviewTopicsJob(
  job: Job<DiscoverReviewTopicsJobPayload>,
): DiscoverReviewTopicsJobPayload {
  return discoverReviewTopicsJobPayloadSchema.parse(job.data)
}
