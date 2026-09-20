import type { Job, SendOptions, WorkOptions } from 'pg-boss'
import { PgBoss } from 'pg-boss'
import { z } from 'zod'

export const generateReplyDraftJobName = 'generate-reply-draft'
export const syncStoreConnectionJobName = 'sync-store-connection'

export const reviewInboxJobNames = [generateReplyDraftJobName, syncStoreConnectionJobName] as const

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

export type GenerateReplyDraftJobPayload = z.infer<typeof generateReplyDraftJobPayloadSchema>
export type SyncStoreConnectionJobPayload = z.infer<typeof syncStoreConnectionJobPayloadSchema>

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
  workGenerateReplyDraft(handler: QueueJobHandler<GenerateReplyDraftJobPayload>): Promise<string>
  workSyncStoreConnection(handler: QueueJobHandler<SyncStoreConnectionJobPayload>): Promise<string>
}

export type QueueClientOptions = {
  databaseUrl: string
  schema?: string
  onError?: (error: Error) => void
  boss?: QueueClientBoss
}

type QueuePayload = GenerateReplyDraftJobPayload | SyncStoreConnectionJobPayload

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
    workGenerateReplyDraft: (handler) => workGenerateReplyDraft(boss, handler),
    workSyncStoreConnection: (handler) => workSyncStoreConnection(boss, handler),
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
