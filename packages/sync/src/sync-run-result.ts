import type { syncRuns } from '@reviewinbox/db'
import { reviewSyncCheckpointSchema, type ReviewSyncCheckpoint } from '@reviewinbox/store-adapters'

export type SyncRunResult = {
  id: string
  organizationId: string
  appId: string
  storeConnectionId: string
  status: 'pending' | 'running' | 'succeeded' | 'partial' | 'failed'
  startedAt: string | null
  finishedAt: string | null
  fetchedCount: number
  storedCount: number
  errorCode: string | null
  errorMessage: string | null
  checkpoint: ReviewSyncCheckpoint | null
  newReviewIds: string[]
  createdAt: string
  updatedAt: string
}

export function toSyncRunResult(run: typeof syncRuns.$inferSelect): SyncRunResult {
  const checkpoint = reviewSyncCheckpointSchema.safeParse(run.checkpoint)
  return {
    id: run.id,
    organizationId: run.organizationId,
    appId: run.appId,
    storeConnectionId: run.storeConnectionId,
    status: run.status,
    startedAt: run.startedAt?.toISOString() ?? null,
    finishedAt: run.finishedAt?.toISOString() ?? null,
    fetchedCount: run.fetchedCount,
    storedCount: run.storedCount,
    errorCode: run.errorCode,
    errorMessage: run.errorMessage,
    checkpoint: checkpoint.success ? checkpoint.data : null,
    newReviewIds: [],
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  }
}
