import type {
  ListReplyAuditEventResponse,
  ReplyStatus,
  ReportedSeverity,
} from '@reviewinbox/contracts'

type Severity = ReportedSeverity | 'unknown'
type BadgeValue =
  | ReplyStatus
  | ListReplyAuditEventResponse['action']
  | Severity
  | 'imported'
  | 'connected'
  | 'metadata'

const pill =
  'inline-flex w-fit items-center whitespace-nowrap rounded-xs border px-2 py-0.5 text-xs font-medium'
const outlined = 'border-border-strong bg-transparent text-ink-muted'
const drafted = 'border-transparent bg-primary-tint text-primary-tint-ink'
const published = 'border-transparent bg-published text-published-ink'
const failed = 'border-failure-border bg-failure text-failure-ink'

const pills: Record<BadgeValue, string> = {
  pending: outlined,
  imported: outlined,
  unignored: outlined,
  metadata: outlined,
  drafted,
  draft_created: drafted,
  draft_edited: drafted,
  published,
  connected: published,
  ignored: 'border-dashed border-ignored-border bg-transparent text-ink-muted',
  failed,
  publish_failed: failed,
  critical: failed,
  blocking: failed,
  degraded: 'border-severity-degraded/30 bg-severity-degraded-tint text-severity-degraded-ink',
  minor: 'border-warning-border bg-warning text-warning-ink',
  none: 'border-border-strong bg-surface-2 text-ink-muted',
  unknown: 'border-dashed border-ink-subtle bg-transparent text-ink-subtle',
}

const indicators: Partial<Record<BadgeValue, string>> = {
  critical: 'bg-severity-critical',
  blocking: 'bg-severity-blocking',
  degraded: 'bg-severity-degraded',
  minor: 'bg-severity-minor',
  none: 'bg-severity-none',
  unknown: 'border border-dashed border-ink-subtle bg-transparent',
}

export function badgeClasses(value: Severity, appearance: 'indicator'): string
export function badgeClasses(value: BadgeValue, appearance?: 'pill'): string
export function badgeClasses(value: BadgeValue, appearance: 'pill' | 'indicator' = 'pill'): string {
  if (appearance === 'indicator') {
    return indicators[value] ?? pills[value]
  }
  return `${pill} ${pills[value]}`
}
