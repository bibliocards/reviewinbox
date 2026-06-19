import type { ReviewSyncCheckpoint } from './index'

export function readString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null
}

export function readRating(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5 ? value : 1
}

export function getCheckpointReviewedAt(checkpoint: ReviewSyncCheckpoint | null) {
  const value = checkpoint?.['lastReviewedAt']
  return typeof value === 'string' ? value : null
}
