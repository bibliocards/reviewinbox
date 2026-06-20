import { loadAiConfig } from '@reviewinbox/config'
import { createQueueClient } from '@reviewinbox/queue'

import { serverConfig } from './db'

const aiConfig = loadAiConfig()
const queue = createQueueClient({
  databaseUrl: serverConfig.databaseUrl,
  onError: (error) => {
    console.error('ReviewInbox API queue error', serializeErrorForLog(error))
  },
})

let queueStartPromise: Promise<void> | null = null

export async function enqueueGenerateReplyDraftJobs(input: { organizationId: string; reviewIds: string[] }): Promise<number> {
  if (aiConfig.provider === 'disabled' || input.reviewIds.length === 0) {
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
