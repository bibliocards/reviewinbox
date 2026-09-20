import { pathToFileURL } from 'node:url'

import type { Database } from '@reviewinbox/db'
import {
  closeDatabase,
  createDatabase,
  member,
  organization,
  publishedReplies,
  replyDrafts,
  reviews,
  storeConnections,
  storeCredentials,
  subscription,
  user,
} from '@reviewinbox/db'
import { and, eq, gte, inArray, lt, notInArray } from 'drizzle-orm'

const stageNames = [
  'user_registered',
  'organization_created',
  'store_validated',
  'first_import',
  'first_draft',
  'first_published',
  'returned',
  'billing_active',
] as const

export type FunnelStage = (typeof stageNames)[number]

export type DateRange = {
  from: Date
  to: Date
  fromDate: string
  toDate: string
}

export type AcquisitionFunnelReport = {
  period: {
    from: string
    toExclusive: string
  }
  excludedOrganizationCount: number
  counts: Record<FunnelStage, number | null>
  rates: {
    storeValidatedFromOrganization: Rate
    firstImportFromOrganization: Rate
    firstDraftFromOrganization: Rate
    firstPublishedFromOrganization: Rate
    billingActiveFromOrganization: Rate
  }
}

export type Rate = {
  numerator: number
  denominator: number
  denominatorStage: FunnelStage
  value: number | null
}

export type FunnelFacts = {
  userIds: Iterable<string>
  organizationIds: Iterable<string>
  storeValidatedOrganizationIds: Iterable<string>
  importedOrganizationIds: Iterable<string>
  draftedOrganizationIds: Iterable<string>
  publishedOrganizationIds: Iterable<string>
  billingActiveOrganizationIds: Iterable<string>
  excludedOrganizationCount?: number
}

type CliOptions = {
  dateRange: DateRange
  excludedOrganizationIds: string[]
}

type ReadDatabase = Pick<Database, 'select' | 'selectDistinct'>

export function parseDateRange(fromValue: string, toValue: string): DateRange {
  const from = parseDate(fromValue, '--from')
  const to = parseDate(toValue, '--to')

  if (from >= to) {
    throw new Error('--from must be before --to.')
  }

  return { from, to, fromDate: fromValue, toDate: toValue }
}

export function parseCliArguments(argv: readonly string[]): CliOptions {
  let fromValue: string | undefined
  let toValue: string | undefined
  const excludedOrganizationIds: string[] = []

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (!argument) {
      throw new Error('Missing command-line argument.')
    }
    if (argument === '--help' || argument === '-h') {
      throw new HelpRequestedError()
    }

    const [option, inlineValue] = argument.split('=', 2)
    if (option === '--from' || option === '--to' || option === '--exclude-org-id') {
      const value = inlineValue ?? argv[index + 1]
      if (!value || (!inlineValue && value.startsWith('--'))) {
        throw new Error(`${option} requires a value.`)
      }
      if (!inlineValue) {
        index += 1
      }

      if (option === '--from') {
        fromValue = value
      } else if (option === '--to') {
        toValue = value
      } else {
        const organizationIds = value
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
        if (organizationIds.length === 0) {
          throw new Error(`${option} requires at least one Organization ID.`)
        }
        excludedOrganizationIds.push(...organizationIds)
      }
      continue
    }

    throw new Error('Unknown command-line option.')
  }

  if (!fromValue || !toValue) {
    throw new Error('--from and --to are required.')
  }

  return {
    dateRange: parseDateRange(fromValue, toValue),
    excludedOrganizationIds: [...new Set(excludedOrganizationIds)],
  }
}

export function buildFunnelReport(dateRange: DateRange, facts: FunnelFacts): AcquisitionFunnelReport {
  const cohortOrganizationIds = new Set(facts.organizationIds)
  const organizationCount = cohortOrganizationIds.size
  const storeValidatedCount = countOrganizationsInCohort(facts.storeValidatedOrganizationIds, cohortOrganizationIds)
  const importedCount = countOrganizationsInCohort(facts.importedOrganizationIds, cohortOrganizationIds)
  const draftedCount = countOrganizationsInCohort(facts.draftedOrganizationIds, cohortOrganizationIds)
  const publishedCount = countOrganizationsInCohort(facts.publishedOrganizationIds, cohortOrganizationIds)
  const billingActiveCount = countOrganizationsInCohort(facts.billingActiveOrganizationIds, cohortOrganizationIds)

  return {
    period: { from: dateRange.fromDate, toExclusive: dateRange.toDate },
    excludedOrganizationCount: facts.excludedOrganizationCount ?? 0,
    counts: {
      user_registered: countDistinct(facts.userIds),
      organization_created: organizationCount,
      store_validated: storeValidatedCount,
      first_import: importedCount,
      first_draft: draftedCount,
      first_published: publishedCount,
      returned: null,
      billing_active: billingActiveCount,
    },
    rates: {
      // User registrations are a separate volume. Every Organization stage uses the
      // same cohort denominator so these rates cannot compare different units.
      storeValidatedFromOrganization: makeRate(storeValidatedCount, organizationCount, 'organization_created'),
      firstImportFromOrganization: makeRate(importedCount, organizationCount, 'organization_created'),
      firstDraftFromOrganization: makeRate(draftedCount, organizationCount, 'organization_created'),
      firstPublishedFromOrganization: makeRate(publishedCount, organizationCount, 'organization_created'),
      billingActiveFromOrganization: makeRate(billingActiveCount, organizationCount, 'organization_created'),
    },
  }
}

export async function collectFunnelReport(
  database: Database,
  dateRange: DateRange,
  excludedOrganizationIds: readonly string[] = [],
): Promise<AcquisitionFunnelReport> {
  return database.transaction((transaction) => collectFunnelReportFromSnapshot(transaction, dateRange, excludedOrganizationIds), {
    isolationLevel: 'repeatable read',
    accessMode: 'read only',
  })
}

async function collectFunnelReportFromSnapshot(
  database: ReadDatabase,
  dateRange: DateRange,
  excludedOrganizationIds: readonly string[],
): Promise<AcquisitionFunnelReport> {
  const allOrganizations = await database
    .select({ id: organization.id })
    .from(organization)
    .where(and(gte(organization.createdAt, dateRange.from), lt(organization.createdAt, dateRange.to)))

  const excludedOrganizationIdSet = new Set(excludedOrganizationIds)
  const cohortOrganizationIds = allOrganizations.map(({ id }) => id).filter((id) => !excludedOrganizationIdSet.has(id))
  const excludedOrganizationCount = allOrganizations.length - cohortOrganizationIds.length

  const [users, excludedMembers] = await Promise.all([
    database
      .select({ userId: user.id })
      .from(user)
      .where(and(gte(user.createdAt, dateRange.from), lt(user.createdAt, dateRange.to))),
    excludedOrganizationIds.length > 0
      ? database.selectDistinct({ userId: member.userId }).from(member).where(inArray(member.organizationId, excludedOrganizationIds))
      : Promise.resolve([]),
  ])
  const excludedUserIds = new Set(excludedMembers.map(({ userId }) => userId))

  const facts: FunnelFacts = {
    userIds: users.map(({ userId }) => userId).filter((userId) => !excludedUserIds.has(userId)),
    organizationIds: cohortOrganizationIds,
    storeValidatedOrganizationIds: [],
    importedOrganizationIds: [],
    draftedOrganizationIds: [],
    publishedOrganizationIds: [],
    billingActiveOrganizationIds: [],
    excludedOrganizationCount,
  }

  if (cohortOrganizationIds.length === 0) {
    return buildFunnelReport(dateRange, facts)
  }

  const cohortOrganizationSubquery = database
    .select({ id: organization.id })
    .from(organization)
    .where(
      and(
        gte(organization.createdAt, dateRange.from),
        lt(organization.createdAt, dateRange.to),
        excludedOrganizationIds.length > 0 ? notInArray(organization.id, [...excludedOrganizationIds]) : undefined,
      ),
    )

  const storeOrganizationScope = inArray(storeConnections.organizationId, cohortOrganizationSubquery)
  const reviewOrganizationScope = inArray(reviews.organizationId, cohortOrganizationSubquery)
  const draftOrganizationScope = inArray(replyDrafts.organizationId, cohortOrganizationSubquery)
  const publishedOrganizationScope = inArray(publishedReplies.organizationId, cohortOrganizationSubquery)
  const billingOrganizationScope = inArray(subscription.referenceId, cohortOrganizationSubquery)

  const [validatedStores, importedReviews, drafts, published, activeSubscriptions] = await Promise.all([
    database
      .selectDistinct({ organizationId: storeConnections.organizationId })
      .from(storeConnections)
      .innerJoin(storeCredentials, eq(storeCredentials.storeConnectionId, storeConnections.id))
      .where(and(storeOrganizationScope, lt(storeCredentials.createdAt, dateRange.to))),
    database
      .selectDistinct({ organizationId: reviews.organizationId })
      .from(reviews)
      .where(and(reviewOrganizationScope, lt(reviews.createdAt, dateRange.to))),
    database
      .selectDistinct({ organizationId: replyDrafts.organizationId })
      .from(replyDrafts)
      .where(and(draftOrganizationScope, lt(replyDrafts.createdAt, dateRange.to))),
    database
      .selectDistinct({ organizationId: publishedReplies.organizationId })
      .from(publishedReplies)
      .where(and(publishedOrganizationScope, lt(publishedReplies.publishedAt, dateRange.to))),
    database
      .selectDistinct({ organizationId: subscription.referenceId })
      .from(subscription)
      .where(and(billingOrganizationScope, inArray(subscription.status, ['active', 'trialing']))),
  ])

  facts.storeValidatedOrganizationIds = validatedStores.map(({ organizationId }) => organizationId)
  facts.importedOrganizationIds = importedReviews.map(({ organizationId }) => organizationId)
  facts.draftedOrganizationIds = drafts.map(({ organizationId }) => organizationId)
  facts.publishedOrganizationIds = published.map(({ organizationId }) => organizationId)
  facts.billingActiveOrganizationIds = activeSubscriptions.map(({ organizationId }) => organizationId)

  return buildFunnelReport(dateRange, facts)
}

function countDistinct(values: Iterable<string>): number {
  return new Set(values).size
}

function countOrganizationsInCohort(values: Iterable<string>, cohortOrganizationIds: ReadonlySet<string>): number {
  return countDistinct(Array.from(values).filter((organizationId) => cohortOrganizationIds.has(organizationId)))
}

function makeRate(numerator: number, denominator: number, denominatorStage: FunnelStage): Rate {
  return {
    numerator,
    denominator,
    denominatorStage,
    value: denominator === 0 ? null : numerator / denominator,
  }
}

function parseDate(value: string, option: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${option} must use YYYY-MM-DD.`)
  }

  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${option} is not a valid calendar date.`)
  }
  return date
}

export class HelpRequestedError extends Error {}

function printHelp(): void {
  console.log(`Usage: pnpm exec tsx --tsconfig tsconfig.base.json scripts/acquisition-funnel.ts --from YYYY-MM-DD --to YYYY-MM-DD [options]

Options:
  --from YYYY-MM-DD          Inclusive Organization cohort start.
  --to YYYY-MM-DD            Exclusive Organization cohort end.
  --exclude-org-id ID        Exclude an internal Organization (repeatable or comma-separated).
  --help                     Show this help.

DATABASE_URL must be set by the operator. The command only reads the database and prints aggregate JSON.`)
}

async function main(): Promise<void> {
  let options: CliOptions
  try {
    options = parseCliArguments(process.argv.slice(2))
  } catch (error) {
    if (error instanceof HelpRequestedError) {
      printHelp()
      return
    }
    throw error
  }

  const databaseUrl = process.env['DATABASE_URL']
  if (!databaseUrl) {
    throw new Error('DATABASE_URL must be set by the operator.')
  }

  const database = createDatabase(databaseUrl)
  let report: AcquisitionFunnelReport | undefined
  let databaseError: string | undefined
  try {
    report = await collectFunnelReport(database, options.dateRange, options.excludedOrganizationIds)
  } catch {
    databaseError = 'Could not collect the acquisition funnel report because a database query failed.'
  }

  try {
    await closeDatabase(database)
  } catch {
    databaseError ??= 'Could not close the acquisition funnel database connection.'
  }

  if (databaseError) {
    throw new Error(databaseError)
  }
  if (!report) {
    throw new Error('The acquisition funnel report did not produce a result.')
  }

  console.log(JSON.stringify(report, null, 2))
}

const invokedScript = process.argv[1]
if (invokedScript && import.meta.url === pathToFileURL(invokedScript).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Acquisition funnel report failed.')
    process.exitCode = 1
  })
}
