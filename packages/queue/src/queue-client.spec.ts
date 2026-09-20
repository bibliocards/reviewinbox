import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createQueueClient,
  type QueueJobHandler,
  type QueueClientBoss,
  type SyncStoreConnectionJobPayload,
  syncStoreConnectionJobName,
} from './queue-client'

const fakeBoss = {
  on: vi.fn<QueueClientBoss['on']>(),
  createQueue: vi.fn<QueueClientBoss['createQueue']>(),
  send: vi.fn<QueueClientBoss['send']>(),
  start: vi.fn<QueueClientBoss['start']>(),
  stop: vi.fn<QueueClientBoss['stop']>(),
  work: vi.fn<QueueClientBoss['work']>(),
} satisfies QueueClientBoss

const jobMetadata = {
  name: syncStoreConnectionJobName,
  expireInSeconds: 300,
  heartbeatSeconds: null,
}

const payload = {
  organizationId: 'organization-id',
  storeConnectionId: '00000000-0000-4000-8000-000000000001',
  windowStartsAt: '2026-09-20T06:00:00.000Z',
  trigger: 'automatic' as const,
}

beforeEach(() => {
  vi.clearAllMocks()
  fakeBoss.createQueue.mockResolvedValue()
  fakeBoss.send.mockResolvedValue('job-id')
  fakeBoss.start.mockResolvedValue(fakeBoss)
  fakeBoss.stop.mockResolvedValue()
  fakeBoss.work.mockResolvedValue('worker-id')
})

describe('sync Store Connection queue enqueueing', () => {
  it('sends jobs to the sync queue with their explicit trigger', async () => {
    const queue = createQueueClient({ databaseUrl: 'postgres://example', boss: fakeBoss })

    await queue.enqueueSyncStoreConnection(payload)

    expect(fakeBoss.send).toHaveBeenCalledWith(
      syncStoreConnectionJobName,
      payload,
      expect.objectContaining({
        singletonKey: `${payload.windowStartsAt}:${payload.storeConnectionId}`,
      }),
    )
  })

  it('requires a trigger when enqueuing a sync job', async () => {
    const queue = createQueueClient({ databaseUrl: 'postgres://example', boss: fakeBoss })
    const payloadWithoutTrigger = {
      organizationId: payload.organizationId,
      storeConnectionId: payload.storeConnectionId,
      windowStartsAt: payload.windowStartsAt,
    }

    await expect(
      // @ts-expect-error SAFETY: this test verifies runtime validation of a missing trigger.
      queue.enqueueSyncStoreConnection(payloadWithoutTrigger),
    ).rejects.toThrow(/trigger/u)
    expect(fakeBoss.send).not.toHaveBeenCalled()
  })
})

describe('sync Store Connection queue workers', () => {
  it('reads and validates sync jobs from the single sync queue', async () => {
    const queue = createQueueClient({ databaseUrl: 'postgres://example', boss: fakeBoss })
    const handler = vi.fn<QueueJobHandler<SyncStoreConnectionJobPayload>>().mockResolvedValue()

    await queue.workSyncStoreConnection(handler)

    expect(fakeBoss.work).toHaveBeenCalledWith(
      syncStoreConnectionJobName,
      expect.any(Object),
      expect.any(Function),
    )
    const workerCallback = fakeBoss.work.mock.calls[0]?.[2]
    await workerCallback?.([
      { ...jobMetadata, id: 'sync-job-id', data: payload, signal: new AbortController().signal },
    ])

    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: 'sync-job-id', payload }))
  })

  it('rejects a sync job without an explicit trigger before handling it', async () => {
    const queue = createQueueClient({ databaseUrl: 'postgres://example', boss: fakeBoss })
    const handler = vi.fn<QueueJobHandler<SyncStoreConnectionJobPayload>>().mockResolvedValue()

    await queue.workSyncStoreConnection(handler)
    const workerCallback = fakeBoss.work.mock.calls[0]?.[2]

    await expect(
      workerCallback?.([
        {
          ...jobMetadata,
          id: 'malformed-job-id',
          data: { ...payload, trigger: undefined },
          signal: new AbortController().signal,
        },
      ]),
    ).rejects.toThrow(/trigger/u)
    expect(handler).not.toHaveBeenCalled()
  })
})

describe('sync Store Connection batch processing', () => {
  it('handles sync jobs sequentially in the received order', async () => {
    const queue = createQueueClient({ databaseUrl: 'postgres://example', boss: fakeBoss })
    const events: string[] = []
    let activeJobs = 0
    let maximumActiveJobs = 0
    const handler: QueueJobHandler<SyncStoreConnectionJobPayload> = async ({ id }) => {
      events.push(`start:${id}`)
      activeJobs += 1
      maximumActiveJobs = Math.max(maximumActiveJobs, activeJobs)
      await Promise.resolve()
      events.push(`end:${id}`)
      activeJobs -= 1
    }

    await queue.workSyncStoreConnection(handler)
    const workerCallback = fakeBoss.work.mock.calls[0]?.[2]
    await workerCallback?.([
      { ...jobMetadata, id: 'first-job-id', data: payload, signal: new AbortController().signal },
      { ...jobMetadata, id: 'second-job-id', data: payload, signal: new AbortController().signal },
    ])

    expect(events).toEqual([
      'start:first-job-id',
      'end:first-job-id',
      'start:second-job-id',
      'end:second-job-id',
    ])
    expect(maximumActiveJobs).toBe(1)
  })

  it('stops processing the batch when a sync job fails', async () => {
    const queue = createQueueClient({ databaseUrl: 'postgres://example', boss: fakeBoss })
    const handler = vi
      .fn<QueueJobHandler<SyncStoreConnectionJobPayload>>()
      .mockRejectedValue(new Error('first job failed'))

    await queue.workSyncStoreConnection(handler)
    const workerCallback = fakeBoss.work.mock.calls[0]?.[2]
    await expect(
      workerCallback?.([
        { ...jobMetadata, id: 'first-job-id', data: payload, signal: new AbortController().signal },
        {
          ...jobMetadata,
          id: 'second-job-id',
          data: payload,
          signal: new AbortController().signal,
        },
      ]),
    ).rejects.toThrow('first job failed')

    expect(handler).toHaveBeenCalledTimes(1)
  })
})
