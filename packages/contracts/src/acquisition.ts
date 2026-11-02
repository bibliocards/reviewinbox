import { z } from 'zod'

const label = z
  .string()
  .max(80)
  .regex(/^[a-z0-9][a-z0-9._-]*$/u)

export const acquisitionSchema = z.object({
  source: label,
  medium: label,
  campaign: label.optional(),
  landingPath: z
    .string()
    .max(200)
    .regex(/^\/(?:(?:docs|guides)\/[a-z0-9/-]*|pricing\/?)?$/u),
})

export type Acquisition = z.infer<typeof acquisitionSchema>

export const acquisitionStorageKey = 'reviewinbox.acquisition'

export function parseStoredAcquisition(value: string | null): Acquisition | null {
  try {
    const parsed = acquisitionSchema.safeParse(JSON.parse(value ?? 'null'))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** The URL contract carries only attribution labels, never full referrer URLs or queries. */
export function acquisitionFromVisit(url: URL, referrer: string): Acquisition {
  const params = url.searchParams
  const path = acquisitionSchema.shape.landingPath.safeParse(url.pathname)
  const landingPath = path.success ? path.data : '/'
  const forwarded = acquisitionSchema.safeParse({
    source: params.get('ri_source'),
    medium: params.get('ri_medium'),
    campaign: params.get('ri_campaign') ?? undefined,
    landingPath: params.get('ri_landing'),
  })
  if (forwarded.success) {
    return forwarded.data
  }

  const campaign = acquisitionSchema.safeParse({
    source: params.get('utm_source')?.toLowerCase(),
    medium: params.get('utm_medium')?.toLowerCase() ?? 'campaign',
    campaign: params.get('utm_campaign')?.toLowerCase(),
    landingPath,
  })
  if (campaign.success) {
    return campaign.data
  }

  return { ...referrerSource(url, referrer), landingPath }
}

export function withAcquisition(url: URL, acquisition: Acquisition): URL {
  const result = new URL(url)
  result.searchParams.set('ri_source', acquisition.source)
  result.searchParams.set('ri_medium', acquisition.medium)
  result.searchParams.set('ri_landing', acquisition.landingPath)
  if (acquisition.campaign === undefined) {
    result.searchParams.delete('ri_campaign')
  } else {
    result.searchParams.set('ri_campaign', acquisition.campaign)
  }
  return result
}

function referrerSource(url: URL, referrer: string): Pick<Acquisition, 'source' | 'medium'> {
  let hostname: string
  try {
    hostname = new URL(referrer).hostname.replace(/^www\./u, '')
  } catch {
    return { source: 'direct', medium: 'direct' }
  }

  if (
    hostname === url.hostname
    || ['reviewinbox.app', 'cloud.reviewinbox.app'].includes(hostname)
  ) {
    return { source: 'direct', medium: 'direct' }
  }
  if (/^(?:[a-z0-9-]+\.)?google\.[a-z.]+$/u.test(hostname)) {
    return { source: 'google', medium: 'organic' }
  }
  const source = label.safeParse(hostname)
  return (
    knownReferrers.get(hostname) ?? {
      source: source.success ? source.data : 'referral',
      medium: 'referral',
    }
  )
}

const knownReferrers = new Map<string, Pick<Acquisition, 'source' | 'medium'>>([
  ['bing.com', { source: 'bing', medium: 'organic' }],
  ['chatgpt.com', { source: 'chatgpt', medium: 'ai' }],
  ['chat.openai.com', { source: 'chatgpt', medium: 'ai' }],
  ['perplexity.ai', { source: 'perplexity', medium: 'ai' }],
  ['claude.ai', { source: 'claude', medium: 'ai' }],
  ['github.com', { source: 'github', medium: 'referral' }],
])
