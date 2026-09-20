import { createQueueClient } from '@reviewinbox/queue'

import { serverConfig } from './db'
import {
  enqueueInitialStoreConnectionSync,
  type InitialSyncConnection,
  type InitialSyncEnqueueResult,
} from './initial-sync'

const queue = createQueueClient({
  databaseUrl: serverConfig.databaseUrl,
  onError: (error) => {
    process.stderr.write(
      `ReviewInbox API queue error: ${formatError(error instanceof Error ? error : null)}\n`,
    )
  },
})

let queueStartPromise: Promise<void> | null = null

export async function enqueueGenerateReplyDraftJobs(input: {
  organizationId: string
  reviewIds: string[]
}): Promise<number> {
  if (!serverConfig.replyDraftWorkerEnabled || input.reviewIds.length === 0) {
    return 0
  }

  await ensureQueueStarted()

  const results = await Promise.all(
    input.reviewIds.map(async (reviewId) => {
      try {
        await queue.enqueueGenerateReplyDraft({ organizationId: input.organizationId, reviewId })
        return true
      } catch (error) {
        process.stderr.write(
          `ReviewInbox draft job enqueue failed for Review ${reviewId}: ${formatError(error instanceof Error ? error : null)}\n`,
        )
        return false
      }
    }),
  )

  return results.filter(Boolean).length
}

export async function enqueueInitialStoreConnectionSyncJobs(input: {
  organizationId: string
  connections: InitialSyncConnection[]
}): Promise<InitialSyncEnqueueResult> {
  if (input.connections.length === 0) {
    return { status: 'not_requested', queuedStoreConnectionIds: [], failedStoreConnectionIds: [] }
  }

  try {
    await ensureQueueStarted()
  } catch (error) {
    process.stderr.write(
      `ReviewInbox initial Store Connection sync queue could not start: ${formatError(error instanceof Error ? error : null)}\n`,
    )
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
    process.stderr.write(
      `ReviewInbox initial Store Connection sync enqueue failed for ${input.organizationId}: ${result.status}\n`,
    )
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

function formatError(error: Error | null): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`
  }

  return 'Unknown API queue error'
}
