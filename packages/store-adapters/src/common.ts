import type { ReviewSyncCheckpoint } from './index'

export function readString(value: string | null | undefined) {
  return value === undefined || value === null || value.length === 0 ? null : value
}

export function readRating(value: number | null | undefined) {
  return value !== undefined
    && value !== null
    && Number.isInteger(value)
    && value >= 1
    && value <= 5
    ? value
    : 1
}

export function getCheckpointReviewedAt(checkpoint: ReviewSyncCheckpoint | null) {
  return checkpoint?.lastReviewedAt ?? null
}
