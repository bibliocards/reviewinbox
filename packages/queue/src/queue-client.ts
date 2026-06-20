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
})

export type GenerateReplyDraftJobPayload = z.infer<typeof generateReplyDraftJobPayloadSchema>
export type SyncStoreConnectionJobPayload = z.infer<typeof syncStoreConnectionJobPayloadSchema>

export type QueueJobOptions = {
  priority?: number
  startAfter?: number | string | Date
}

export type QueueJobHandler<TPayload> = (job: { id: string; payload: TPayload; signal: AbortSignal }) => Promise<void>

export type QueueClient = {
  start(): Promise<void>
  stop(): Promise<void>
  enqueueGenerateReplyDraft(payload: GenerateReplyDraftJobPayload, options?: QueueJobOptions): Promise<string>
  enqueueSyncStoreConnection(payload: SyncStoreConnectionJobPayload, options?: QueueJobOptions): Promise<string>
  workGenerateReplyDraft(handler: QueueJobHandler<GenerateReplyDraftJobPayload>): Promise<string>
  workSyncStoreConnection(handler: QueueJobHandler<SyncStoreConnectionJobPayload>): Promise<string>
}

export type QueueClientOptions = {
  databaseUrl: string
  schema?: string
  onError?: (error: Error) => void
}

export function createQueueClient(options: QueueClientOptions): QueueClient {
  const boss = new PgBoss({
    connectionString: options.databaseUrl,
    schema: options.schema ?? 'pgboss',
  })

  if (options.onError) {
    boss.on('error', options.onError)
  }

  return {
    async start() {
      await boss.start()
      await ensureQueues(boss)
    },
    async stop() {
      await boss.stop({ graceful: true })
    },
    async enqueueGenerateReplyDraft(payload, jobOptions) {
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
    },
    async enqueueSyncStoreConnection(payload, jobOptions) {
      const parsedPayload = syncStoreConnectionJobPayloadSchema.parse(payload)
      const jobId = await boss.send(syncStoreConnectionJobName, parsedPayload, {
        ...defaultSyncStoreConnectionJobOptions,
        ...jobOptions,
        singletonKey: `${parsedPayload.windowStartsAt}:${parsedPayload.storeConnectionId}`,
      })

      if (jobId === null) {
        throw new Error('pg-boss did not create a sync-store-connection job.')
      }

      return jobId
    },
    async workGenerateReplyDraft(handler) {
      return boss.work<GenerateReplyDraftJobPayload>(generateReplyDraftJobName, defaultGenerateReplyDraftWorkOptions, async (jobs) => {
        for (const job of jobs) {
          await handler({
            id: job.id,
            payload: parseGenerateReplyDraftJob(job),
            signal: job.signal,
          })
        }
      })
    },
    async workSyncStoreConnection(handler) {
      return boss.work<SyncStoreConnectionJobPayload>(syncStoreConnectionJobName, defaultSyncStoreConnectionWorkOptions, async (jobs) => {
        for (const job of jobs) {
          await handler({
            id: job.id,
            payload: parseSyncStoreConnectionJob(job),
            signal: job.signal,
          })
        }
      })
    },
  }
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

async function ensureQueues(boss: PgBoss): Promise<void> {
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

function parseGenerateReplyDraftJob(job: Job<GenerateReplyDraftJobPayload>): GenerateReplyDraftJobPayload {
  return generateReplyDraftJobPayloadSchema.parse(job.data)
}

function parseSyncStoreConnectionJob(job: Job<SyncStoreConnectionJobPayload>): SyncStoreConnectionJobPayload {
  return syncStoreConnectionJobPayloadSchema.parse(job.data)
}
