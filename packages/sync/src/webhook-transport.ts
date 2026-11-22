import { createHmac } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { once } from 'node:events'
import { request } from 'node:https'
import { BlockList, isIP } from 'node:net'
import { checkServerIdentity } from 'node:tls'

import type { SyncWebhookInput } from '@reviewinbox/contracts'
import type { SyncWebhookEvent } from '@reviewinbox/db'

type TestEvent = { eventId: string; type: 'sync.test'; occurredAt: string; message: string }
type DeliveryStatus = 'delivered' | 'retrying' | 'failed'
type Payload = { body: string; headers?: Record<string, string> }

const providerEndpoints = {
  slack: {
    hosts: ['hooks.slack.com', 'hooks.slack-gov.com'],
    path: /^\/services\/[A-Za-z0-9]+\/[A-Za-z0-9]+\/[A-Za-z0-9]+$/u,
  },
  discord: {
    hosts: ['discord.com', 'discordapp.com'],
    path: /^\/api(?:\/v\d+)?\/webhooks\/\d+\/[A-Za-z0-9_-]+$/u,
  },
}

export function webhookUrl(input: SyncWebhookInput): URL | null {
  const url = new URL(input.url)
  if (
    url.protocol !== 'https:'
    || url.port !== ''
    || url.username
    || url.password
    || url.hash
    || url.hostname.startsWith('[')
    || isIP(url.hostname) !== 0
  ) {
    return null
  }
  return input.kind === 'json' || matchesProviderEndpoint(url, providerEndpoints[input.kind])
    ? url
    : null
}

function matchesProviderEndpoint(url: URL, endpoint: typeof providerEndpoints.slack): boolean {
  return (
    url.search === '' && endpoint.hosts.includes(url.hostname) && endpoint.path.test(url.pathname)
  )
}

const privateNetworks = new BlockList()
for (const [base, bits] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 3],
] as const) {
  privateNetworks.addSubnet(base, bits, 'ipv4')
}
for (const [base, bits] of [
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20],
] as const) {
  privateNetworks.addSubnet(base, bits, 'ipv6')
}
const globalIpv6 = new BlockList()
globalIpv6.addSubnet('2000::', 3, 'ipv6')

async function publicAddress(hostname: string) {
  const addresses = await lookup(hostname, { all: true })
  if (
    addresses.some(({ address, family }) =>
      family === 4
        ? privateNetworks.check(address, 'ipv4')
        : !globalIpv6.check(address, 'ipv6') || privateNetworks.check(address, 'ipv6'),
    )
  ) {
    return null
  }
  return addresses[0] ?? null
}

export async function deliverSyncWebhook(
  destination: SyncWebhookInput,
  event: SyncWebhookEvent | TestEvent,
  appOrigin: string,
): Promise<DeliveryStatus> {
  const url = webhookUrl(destination)
  if (!url) {
    return 'failed'
  }
  const signal = AbortSignal.timeout(8000)
  try {
    const address = await Promise.race([
      publicAddress(url.hostname),
      once(signal, 'abort').then(() => null),
    ])
    signal.throwIfAborted()
    return address
      ? await postWebhook(url, address, buildWebhookPayload(destination, event, appOrigin), signal)
      : 'failed'
  } catch {
    return 'retrying'
  }
}

function postWebhook(
  url: URL,
  address: { address: string; family: number },
  payload: Payload,
  signal: AbortSignal,
): Promise<DeliveryStatus> {
  const headers = {
    host: url.host,
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload.body),
    ...payload.headers,
  }
  return new Promise((resolve) => {
    // Connect to the checked address rather than resolving the hostname again.
    // The original hostname still controls SNI, certificate validation and Host.
    const outgoing = request(
      {
        hostname: address.address,
        family: address.family,
        port: 443,
        servername: url.hostname,
        checkServerIdentity: (_hostname, certificate) =>
          checkServerIdentity(url.hostname, certificate),
        path: url.pathname + url.search,
        method: 'POST',
        agent: false,
        signal,
        headers,
      },
      (response) => {
        const status = response.statusCode ?? 500
        response.destroy()
        resolve(deliveryStatus(status))
      },
    )
    outgoing.on('error', () => {
      resolve('retrying')
    })
    outgoing.end(payload.body)
  })
}

function deliveryStatus(status: number): DeliveryStatus {
  if (status >= 200 && status < 300) {
    return 'delivered'
  }
  return status === 429 || status >= 500 ? 'retrying' : 'failed'
}

function buildWebhookPayload(
  destination: SyncWebhookInput,
  event: SyncWebhookEvent | TestEvent,
  appOrigin: string,
): Payload {
  const appUrl = 'appPath' in event ? new URL(event.appPath, appOrigin).href : undefined
  if (destination.kind === 'json') {
    const body = JSON.stringify({ ...event, appUrl })
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const signature = createHmac('sha256', destination.signingSecret)
      .update(`${timestamp}.${body}`)
      .digest('hex')
    return {
      body,
      headers: {
        'x-reviewinbox-event-id': event.eventId,
        'x-reviewinbox-timestamp': timestamp,
        'x-reviewinbox-signature': `sha256=${signature}`,
      },
    }
  }
  const message = formatChatMessage(event, appUrl)
  return destination.kind === 'slack'
    ? {
        body: JSON.stringify({
          text: message.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
          mrkdwn: false,
          unfurl_links: false,
          unfurl_media: false,
        }),
      }
    : { body: JSON.stringify({ content: message, allowed_mentions: { parse: [] } }) }
}

function formatChatMessage(
  event: SyncWebhookEvent | TestEvent,
  appUrl: string | undefined,
): string {
  if (!('store' in event)) {
    return event.message
  }
  const store = event.store === 'apple_app_store' ? 'Apple App Store' : 'Google Play'
  return `${event.appName} · ${store}\n${event.message}\nLast successful sync: ${event.lastSuccessfulSyncAt ?? 'Never'}\n${appUrl ?? ''}`
}
