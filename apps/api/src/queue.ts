import { createQueueClient } from '@reviewinbox/queue'

import { serverConfig } from './db'
import { enqueueInitialStoreConnectionSync, type InitialSyncConnection, type InitialSyncEnqueueResult } from './initial-sync'

const queue = createQueueClient({
  databaseUrl: serverConfig.databaseUrl,
  onError: (error) => {
    console.error('ReviewInbox API queue error', serializeErrorForLog(error))
  },
})

let queueStartPromise: Promise<void> | null = null

export async function enqueueGenerateReplyDraftJobs(input: { organizationId: string; reviewIds: string[] }): Promise<number> {
  if (!serverConfig.replyDraftWorkerEnabled || input.reviewIds.length === 0) {
    return 0
  }

  await ensureQueueStarted()

  let queuedCount = 0
  for (const reviewId of input.reviewIds) {
    try {
      await queue.enqueueGenerateReplyDraft({ organizationId: input.organizationId, reviewId })
      queuedCount += 1
    } catch (error) {
      console.error('ReviewInbox draft job enqueue failed for Review', {
        reviewId,
        error: serializeErrorForLog(error),
      })
    }
  }

  return queuedCount
}

export async function enqueueInitialStoreConnectionSyncJobs(input: {
  organizationId: string
  connections: InitialSyncConnection[]
}): Promise<InitialSyncEnqueueResult> {
  if (input.connections.length === 0) {
    return {
      status: 'not_requested',
      queuedStoreConnectionIds: [],
      failedStoreConnectionIds: [],
    }
  }

  try {
    await ensureQueueStarted()
  } catch (error) {
    console.error('ReviewInbox initial Store Connection sync queue could not start', serializeErrorForLog(error))
    return {
      status: 'failed',
      queuedStoreConnectionIds: [],
      failedStoreConnectionIds: input.connections.map((connection) => connection.storeConnectionId),
    }
  }

  const result = await enqueueInitialStoreConnectionSync({
    queue,
    organizationId: input.organizationId,
    connections: input.connections,
  })

  if (result.failedStoreConnectionIds.length > 0) {
    console.error('ReviewInbox initial Store Connection sync enqueue failed', {
      organizationId: input.organizationId,
      status: result.status,
      queuedStoreConnectionIds: result.queuedStoreConnectionIds,
      failedStoreConnectionIds: result.failedStoreConnectionIds,
    })
  }

  return result
}

async function ensureQueueStarted(): Promise<void> {
  try {
    queueStartPromise ??= queue.start()
    await queueStartPromise
  } catch (error) {
    queueStartPromise = null
    throw error
  }
}

function serializeErrorForLog(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return { name: error.name, message: error.message }
  }

  return { name: 'UnknownError', message: 'Unknown API queue error' }
}
