import { expect, it, vi } from 'vitest'

import { createSyncWebhookDeliverer } from './webhook-transport'

function send(deliver: ReturnType<typeof createSyncWebhookDeliverer>) {
  return deliver(
    { kind: 'json', url: 'https://webhook.example', signingSecret: 'a'.repeat(32) },
    {
      eventId: 'test-event',
      type: 'sync.test',
      occurredAt: '2026-01-01T00:00:00.000Z',
      message: 'Test notification',
    },
    'https://app.example',
  )
}

it('bounds pending webhook DNS lookups even after delivery times out', async () => {
  const deadline = new AbortController()
  const createDeadline = vi
    .fn<() => AbortSignal>()
    .mockReturnValueOnce(deadline.signal)
    .mockReturnValue(new AbortController().signal)
  const stalled = deferredLookup()
  const otherLookups = deferredLookup()
  const lookup = vi
    .fn<(host: string) => Promise<[]>>()
    .mockReturnValueOnce(stalled.promise)
    .mockReturnValue(otherLookups.promise)
  const deliver = createSyncWebhookDeliverer(lookup, createDeadline)

  const timedOut = send(deliver)
  const otherDeliveries = [send(deliver), send(deliver), send(deliver)]
  await expect(send(deliver)).resolves.toBe('retrying')
  expect(lookup).toHaveBeenCalledTimes(4)

  deadline.abort()
  await expect(timedOut).resolves.toBe('retrying')
  await expect(send(deliver)).resolves.toBe('retrying')
  expect(lookup).toHaveBeenCalledTimes(4)

  stalled.fail()
  // A rejected lookup also releases its slot, even if the delivery has already returned.
  await stalled.promise.catch(() => null)
  lookup.mockResolvedValueOnce([])
  await expect(send(deliver)).resolves.toBe('failed')
  otherLookups.finish()
  await expect(Promise.all(otherDeliveries)).resolves.toEqual(['failed', 'failed', 'failed'])
})

function deferredLookup() {
  let finish: (() => void) | undefined
  let fail: (() => void) | undefined
  const promise = new Promise<[]>((resolve, reject) => {
    finish = () => {
      resolve([])
    }
    fail = () => {
      reject(new Error('DNS unavailable'))
    }
  })
  return {
    promise,
    finish() {
      finish?.()
    },
    fail() {
      fail?.()
    },
  }
}
