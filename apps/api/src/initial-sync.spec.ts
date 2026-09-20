import { describe, expect, it, vi } from 'vitest'

import {
  enqueueInitialStoreConnectionSync,
  latestStoreConnectionSyncRevisionAt,
  shouldQueueInitialStoreConnectionSync,
} from './initial-sync'

describe('enqueueInitialStoreConnectionSync', () => {
  it('queues one deterministic first import per Store Connection', async () => {
    const enqueueSyncStoreConnection = vi.fn().mockResolvedValue('job-id')

    const result = await enqueueInitialStoreConnectionSync({
      queue: { enqueueSyncStoreConnection },
      organizationId: 'organization-id',
      connections: [
        { storeConnectionId: 'connection-a', revisionAt: '2026-09-20T10:00:00.000Z' },
        { storeConnectionId: 'connection-a', revisionAt: '2026-09-20T10:00:00.000Z' },
        { storeConnectionId: 'connection-b', revisionAt: new Date('2026-09-20T10:01:00.000Z') },
      ],
    })

    expect(result).toEqual({
      status: 'queued',
      queuedStoreConnectionIds: ['connection-a', 'connection-b'],
      failedStoreConnectionIds: [],
    })
    expect(enqueueSyncStoreConnection).toHaveBeenCalledTimes(2)
    expect(enqueueSyncStoreConnection).toHaveBeenNthCalledWith(1, {
      organizationId: 'organization-id',
      storeConnectionId: 'connection-a',
      windowStartsAt: '2026-09-20T10:00:00.000Z',
      trigger: 'initial',
    })
    expect(enqueueSyncStoreConnection).toHaveBeenNthCalledWith(2, {
      organizationId: 'organization-id',
      storeConnectionId: 'connection-b',
      windowStartsAt: '2026-09-20T10:01:00.000Z',
      trigger: 'initial',
    })
  })

  it('keeps persistence independent when one enqueue fails', async () => {
    const enqueueSyncStoreConnection = vi.fn().mockResolvedValueOnce('job-id').mockRejectedValueOnce(new Error('pg-boss unavailable'))

    const result = await enqueueInitialStoreConnectionSync({
      queue: { enqueueSyncStoreConnection },
      organizationId: 'organization-id',
      connections: [
        { storeConnectionId: 'connection-a', revisionAt: '2026-09-20T10:00:00.000Z' },
        { storeConnectionId: 'connection-b', revisionAt: '2026-09-20T10:01:00.000Z' },
      ],
    })

    expect(result).toEqual({
      status: 'partial',
      queuedStoreConnectionIds: ['connection-a'],
      failedStoreConnectionIds: ['connection-b'],
    })
  })

  it('treats an existing singleton job as an idempotent queue success', async () => {
    const enqueueSyncStoreConnection = vi.fn().mockResolvedValue(null)

    const result = await enqueueInitialStoreConnectionSync({
      queue: { enqueueSyncStoreConnection },
      organizationId: 'organization-id',
      connections: [{ storeConnectionId: 'connection-a', revisionAt: '2026-09-20T10:00:00.000Z' }],
    })

    expect(result).toEqual({
      status: 'queued',
      queuedStoreConnectionIds: ['connection-a'],
      failedStoreConnectionIds: [],
    })
  })

  it('does not enqueue when no verified connection was created', async () => {
    const enqueueSyncStoreConnection = vi.fn()

    await expect(
      enqueueInitialStoreConnectionSync({
        queue: { enqueueSyncStoreConnection },
        organizationId: 'organization-id',
        connections: [],
      }),
    ).resolves.toEqual({
      status: 'not_requested',
      queuedStoreConnectionIds: [],
      failedStoreConnectionIds: [],
    })
    expect(enqueueSyncStoreConnection).not.toHaveBeenCalled()
  })

  it('uses a new queue window for a replaced credential revision', async () => {
    const enqueueSyncStoreConnection = vi.fn().mockResolvedValue('job-id')

    await enqueueInitialStoreConnectionSync({
      queue: { enqueueSyncStoreConnection },
      organizationId: 'organization-id',
      connections: [{ storeConnectionId: 'connection-a', revisionAt: '2026-09-20T10:00:00.000Z' }],
    })
    await enqueueInitialStoreConnectionSync({
      queue: { enqueueSyncStoreConnection },
      organizationId: 'organization-id',
      connections: [{ storeConnectionId: 'connection-a', revisionAt: '2026-09-20T10:05:00.000Z' }],
    })

    expect(enqueueSyncStoreConnection).toHaveBeenNthCalledWith(1, {
      organizationId: 'organization-id',
      storeConnectionId: 'connection-a',
      windowStartsAt: '2026-09-20T10:00:00.000Z',
      trigger: 'initial',
    })
    expect(enqueueSyncStoreConnection).toHaveBeenNthCalledWith(2, {
      organizationId: 'organization-id',
      storeConnectionId: 'connection-a',
      windowStartsAt: '2026-09-20T10:05:00.000Z',
      trigger: 'initial',
    })
  })

  it('retries the same revision after the first enqueue fails', async () => {
    const enqueueSyncStoreConnection = vi.fn().mockRejectedValueOnce(new Error('pg-boss unavailable')).mockResolvedValueOnce('job-id')
    const revisionAt = '2026-09-20T10:00:00.000Z'
    const connection = { storeConnectionId: 'connection-a', revisionAt }

    const firstResult = await enqueueInitialStoreConnectionSync({
      queue: { enqueueSyncStoreConnection },
      organizationId: 'organization-id',
      connections: [connection],
    })

    expect(firstResult).toEqual({
      status: 'failed',
      queuedStoreConnectionIds: [],
      failedStoreConnectionIds: ['connection-a'],
    })
    expect(shouldQueueInitialStoreConnectionSync({ revisionAt, latestSettledAt: null })).toBe(true)

    const retryResult = await enqueueInitialStoreConnectionSync({
      queue: { enqueueSyncStoreConnection },
      organizationId: 'organization-id',
      connections: [connection],
    })

    expect(retryResult).toEqual({
      status: 'queued',
      queuedStoreConnectionIds: ['connection-a'],
      failedStoreConnectionIds: [],
    })
    expect(enqueueSyncStoreConnection).toHaveBeenNthCalledWith(2, {
      organizationId: 'organization-id',
      storeConnectionId: 'connection-a',
      windowStartsAt: revisionAt,
      trigger: 'initial',
    })
  })

  it('does not retry a revision after a later terminal Sync Run', () => {
    expect(
      shouldQueueInitialStoreConnectionSync({
        revisionAt: '2026-09-20T10:00:00.000Z',
        latestSettledAt: '2026-09-20T10:00:00.000Z',
      }),
    ).toBe(false)
    expect(
      shouldQueueInitialStoreConnectionSync({
        revisionAt: '2026-09-20T10:00:00.000Z',
        latestSettledAt: '2026-09-20T10:01:00.000Z',
      }),
    ).toBe(false)
  })

  it('uses the newer connection or credential revision for a retry key', () => {
    expect(
      latestStoreConnectionSyncRevisionAt({
        connectionUpdatedAt: '2026-09-20T10:00:00.000Z',
        credentialUpdatedAt: '2026-09-20T10:05:00.000Z',
      }).toISOString(),
    ).toBe('2026-09-20T10:05:00.000Z')
    expect(
      latestStoreConnectionSyncRevisionAt({
        connectionUpdatedAt: '2026-09-20T10:05:00.000Z',
        credentialUpdatedAt: '2026-09-20T10:00:00.000Z',
      }).toISOString(),
    ).toBe('2026-09-20T10:05:00.000Z')
  })
})
