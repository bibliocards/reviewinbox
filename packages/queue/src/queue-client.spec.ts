import { beforeEach, describe, expect, it, vi } from 'vitest'

const { boss, PgBossMock } = vi.hoisted(() => {
  const boss = {
    createQueue: vi.fn(),
    send: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    work: vi.fn(),
  }

  function PgBossMock() {
    return boss
  }

  return { boss, PgBossMock }
})

vi.mock('pg-boss', () => ({
  PgBoss: PgBossMock,
}))

import { createQueueClient, syncStoreConnectionJobName } from './queue-client'

const payload = {
  organizationId: 'organization-id',
  storeConnectionId: '00000000-0000-4000-8000-000000000001',
  windowStartsAt: '2026-09-20T06:00:00.000Z',
  trigger: 'automatic' as const,
}

describe('sync Store Connection queue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    boss.createQueue.mockResolvedValue(undefined)
    boss.send.mockResolvedValue('job-id')
    boss.start.mockResolvedValue(undefined)
    boss.stop.mockResolvedValue(undefined)
    boss.work.mockResolvedValue('worker-id')
  })

  it('sends jobs to the sync queue with their explicit trigger', async () => {
    const queue = createQueueClient({ databaseUrl: 'postgres://example' })

    await queue.enqueueSyncStoreConnection(payload)

    expect(boss.send).toHaveBeenCalledWith(
      syncStoreConnectionJobName,
      payload,
      expect.objectContaining({ singletonKey: `${payload.windowStartsAt}:${payload.storeConnectionId}` }),
    )
  })

  it('requires a trigger when enqueuing a sync job', async () => {
    const queue = createQueueClient({ databaseUrl: 'postgres://example' })

    await expect(queue.enqueueSyncStoreConnection({ ...payload, trigger: undefined } as never)).rejects.toThrow()
    expect(boss.send).not.toHaveBeenCalled()
  })

  it('reads and validates sync jobs from the single sync queue', async () => {
    const queue = createQueueClient({ databaseUrl: 'postgres://example' })
    const handler = vi.fn().mockResolvedValue(undefined)

    await queue.workSyncStoreConnection(handler)

    expect(boss.work).toHaveBeenCalledWith(syncStoreConnectionJobName, expect.any(Object), expect.any(Function))
    const workerCallback = boss.work.mock.calls[0]?.[2]
    await workerCallback?.([
      {
        id: 'sync-job-id',
        data: payload,
        signal: new AbortController().signal,
      },
    ])

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'sync-job-id',
        payload,
      }),
    )
  })

  it('rejects a sync job without an explicit trigger before handling it', async () => {
    const queue = createQueueClient({ databaseUrl: 'postgres://example' })
    const handler = vi.fn().mockResolvedValue(undefined)

    await queue.workSyncStoreConnection(handler)
    const workerCallback = boss.work.mock.calls[0]?.[2]

    await expect(
      workerCallback?.([
        {
          id: 'malformed-job-id',
          data: { ...payload, trigger: undefined },
          signal: new AbortController().signal,
        },
      ]),
    ).rejects.toThrow()
    expect(handler).not.toHaveBeenCalled()
  })
})
