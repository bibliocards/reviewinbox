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

export type DateRange = { from: Date; to: Date; fromDate: string; toDate: string }

export type AcquisitionFunnelReport = {
  period: { from: string; toExclusive: string }
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

type CliOptions = { dateRange: DateRange; excludedOrganizationIds: string[] }

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
  const values = collectCliValues(argv)
  if (values.fromValue === undefined || values.toValue === undefined) {
    throw new Error('--from and --to are required.')
  }

  return {
    dateRange: parseDateRange(values.fromValue, values.toValue),
    excludedOrganizationIds: [...new Set(values.excludedOrganizationIds)],
  }
}

type CliValues = { fromValue?: string; toValue?: string; excludedOrganizationIds: string[] }

type ParsedCliArgument = {
  option: '--from' | '--to' | '--exclude-org-id'
  value: string
  nextIndex: number
}

function collectCliValues(argv: readonly string[]): CliValues {
  const values: CliValues = { excludedOrganizationIds: [] }
  for (let index = 0; index < argv.length;) {
    const parsed = parseCliArgument(argv, index)
    applyCliArgument(values, parsed)
    index = parsed.nextIndex
  }
  return values
}

function parseCliArgument(argv: readonly string[], index: number): ParsedCliArgument {
  const argument = requireCliArgument(argv[index])
  const [option, inlineValue] = argument.split('=', 2)
  const cliOption = requireCliOption(option)
  const value = requireCliValue(cliOption, inlineValue, argv[index + 1])
  return { option: cliOption, value, nextIndex: inlineValue === undefined ? index + 2 : index + 1 }
}

function requireCliArgument(argument: string | undefined): string {
  if (argument === undefined || argument.length === 0) {
    throw new Error('Missing command-line argument.')
  }
  if (argument === '--help' || argument === '-h') {
    throw new HelpRequestedError()
  }
  return argument
}

function requireCliOption(value: string | undefined): ParsedCliArgument['option'] {
  if (!isCliOption(value)) {
    throw new Error('Unknown command-line option.')
  }
  return value
}

function requireCliValue(
  option: ParsedCliArgument['option'],
  inlineValue: string | undefined,
  nextValue: string | undefined,
): string {
  const value = inlineValue ?? nextValue
  if (value === undefined || value.length === 0) {
    throw new Error(`${option} requires a value.`)
  }
  if (inlineValue === undefined && value.startsWith('--')) {
    throw new Error(`${option} requires a value.`)
  }
  return value
}

function isCliOption(value: string | undefined): value is ParsedCliArgument['option'] {
  return value === '--from' || value === '--to' || value === '--exclude-org-id'
}

function applyCliArgument(values: CliValues, argument: ParsedCliArgument): void {
  if (argument.option === '--from') {
    values.fromValue = argument.value
    return
  }
  if (argument.option === '--to') {
    values.toValue = argument.value
    return
  }

  const organizationIds = argument.value
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
  if (organizationIds.length === 0) {
    throw new Error(`${argument.option} requires at least one Organization ID.`)
  }
  values.excludedOrganizationIds.push(...organizationIds)
}

export function buildFunnelReport(
  dateRange: DateRange,
  facts: FunnelFacts,
): AcquisitionFunnelReport {
  const cohortOrganizationIds = new Set(facts.organizationIds)
  const organizationCount = cohortOrganizationIds.size
  const stageCounts = buildStageCounts(facts, cohortOrganizationIds)

  return {
    period: { from: dateRange.fromDate, toExclusive: dateRange.toDate },
    excludedOrganizationCount: facts.excludedOrganizationCount ?? 0,
    counts: {
      user_registered: countDistinct(facts.userIds),
      organization_created: organizationCount,
      store_validated: stageCounts.storeValidated,
      first_import: stageCounts.imported,
      first_draft: stageCounts.drafted,
      first_published: stageCounts.published,
      returned: null,
      billing_active: stageCounts.billingActive,
    },
    rates: buildRates(stageCounts, organizationCount),
  }
}

type StageCounts = {
  storeValidated: number
  imported: number
  drafted: number
  published: number
  billingActive: number
}

function buildStageCounts(
  facts: FunnelFacts,
  cohortOrganizationIds: ReadonlySet<string>,
): StageCounts {
  return {
    storeValidated: countOrganizationsInCohort(
      facts.storeValidatedOrganizationIds,
      cohortOrganizationIds,
    ),
    imported: countOrganizationsInCohort(facts.importedOrganizationIds, cohortOrganizationIds),
    drafted: countOrganizationsInCohort(facts.draftedOrganizationIds, cohortOrganizationIds),
    published: countOrganizationsInCohort(facts.publishedOrganizationIds, cohortOrganizationIds),
    billingActive: countOrganizationsInCohort(
      facts.billingActiveOrganizationIds,
      cohortOrganizationIds,
    ),
  }
}

function buildRates(
  stageCounts: StageCounts,
  organizationCount: number,
): AcquisitionFunnelReport['rates'] {
  const denominatorStage = 'organization_created' as const
  return {
    // User registrations are a separate volume. Every Organization stage uses the
    // same cohort denominator so these rates cannot compare different units.
    storeValidatedFromOrganization: makeRate(
      stageCounts.storeValidated,
      organizationCount,
      denominatorStage,
    ),
    firstImportFromOrganization: makeRate(
      stageCounts.imported,
      organizationCount,
      denominatorStage,
    ),
    firstDraftFromOrganization: makeRate(stageCounts.drafted, organizationCount, denominatorStage),
    firstPublishedFromOrganization: makeRate(
      stageCounts.published,
      organizationCount,
      denominatorStage,
    ),
    billingActiveFromOrganization: makeRate(
      stageCounts.billingActive,
      organizationCount,
      denominatorStage,
    ),
  }
}

export function collectFunnelReport(
  database: Database,
  dateRange: DateRange,
  excludedOrganizationIds: readonly string[] = [],
): Promise<AcquisitionFunnelReport> {
  return database.transaction(
    (transaction) =>
      collectFunnelReportFromSnapshot(transaction, dateRange, excludedOrganizationIds),
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  )
}

async function collectFunnelReportFromSnapshot(
  database: ReadDatabase,
  dateRange: DateRange,
  excludedOrganizationIds: readonly string[],
): Promise<AcquisitionFunnelReport> {
  const cohort = await loadOrganizationCohort(database, dateRange, excludedOrganizationIds)
  const userIds = await loadCohortUserIds(database, dateRange, excludedOrganizationIds)
  const facts: FunnelFacts = {
    userIds,
    organizationIds: cohort.organizationIds,
    storeValidatedOrganizationIds: [],
    importedOrganizationIds: [],
    draftedOrganizationIds: [],
    publishedOrganizationIds: [],
    billingActiveOrganizationIds: [],
    excludedOrganizationCount: cohort.excludedOrganizationCount,
  }

  if (cohort.organizationIds.length === 0) {
    return buildFunnelReport(dateRange, facts)
  }

  const stageOrganizations = await loadStageOrganizations(
    database,
    dateRange,
    excludedOrganizationIds,
  )
  facts.storeValidatedOrganizationIds = stageOrganizations.storeValidated
  facts.importedOrganizationIds = stageOrganizations.imported
  facts.draftedOrganizationIds = stageOrganizations.drafted
  facts.publishedOrganizationIds = stageOrganizations.published
  facts.billingActiveOrganizationIds = stageOrganizations.billingActive
  return buildFunnelReport(dateRange, facts)
}

type OrganizationCohort = { organizationIds: string[]; excludedOrganizationCount: number }

async function loadOrganizationCohort(
  database: ReadDatabase,
  dateRange: DateRange,
  excludedOrganizationIds: readonly string[],
): Promise<OrganizationCohort> {
  const allOrganizations = await database
    .select({ id: organization.id })
    .from(organization)
    .where(
      and(gte(organization.createdAt, dateRange.from), lt(organization.createdAt, dateRange.to)),
    )

  const excludedOrganizationIdSet = new Set(excludedOrganizationIds)
  const organizationIds = allOrganizations
    .map(({ id }) => id)
    .filter((id) => !excludedOrganizationIdSet.has(id))
  return {
    organizationIds,
    excludedOrganizationCount: allOrganizations.length - organizationIds.length,
  }
}

async function loadCohortUserIds(
  database: ReadDatabase,
  dateRange: DateRange,
  excludedOrganizationIds: readonly string[],
): Promise<string[]> {
  const [users, excludedMembers] = await Promise.all([
    database
      .select({ userId: user.id })
      .from(user)
      .where(and(gte(user.createdAt, dateRange.from), lt(user.createdAt, dateRange.to))),
    excludedOrganizationIds.length > 0
      ? database
          .selectDistinct({ userId: member.userId })
          .from(member)
          .where(inArray(member.organizationId, excludedOrganizationIds))
      : Promise.resolve([]),
  ])
  const excludedUserIds = new Set(excludedMembers.map(({ userId }) => userId))
  return users.map(({ userId }) => userId).filter((userId) => !excludedUserIds.has(userId))
}

type StageOrganizations = {
  storeValidated: string[]
  imported: string[]
  drafted: string[]
  published: string[]
  billingActive: string[]
}

async function loadStageOrganizations(
  database: ReadDatabase,
  dateRange: DateRange,
  excludedOrganizationIds: readonly string[],
): Promise<StageOrganizations> {
  const scopes = buildStageScopes(database, dateRange, excludedOrganizationIds)

  const [validatedStores, importedReviews, drafts, published, activeSubscriptions] =
    await Promise.all([
      database
        .selectDistinct({ organizationId: storeConnections.organizationId })
        .from(storeConnections)
        .innerJoin(storeCredentials, eq(storeCredentials.storeConnectionId, storeConnections.id))
        .where(and(scopes.store, lt(storeCredentials.createdAt, dateRange.to))),
      database
        .selectDistinct({ organizationId: reviews.organizationId })
        .from(reviews)
        .where(and(scopes.review, lt(reviews.createdAt, dateRange.to))),
      database
        .selectDistinct({ organizationId: replyDrafts.organizationId })
        .from(replyDrafts)
        .where(and(scopes.draft, lt(replyDrafts.createdAt, dateRange.to))),
      database
        .selectDistinct({ organizationId: publishedReplies.organizationId })
        .from(publishedReplies)
        .where(and(scopes.published, lt(publishedReplies.publishedAt, dateRange.to))),
      database
        .selectDistinct({ organizationId: subscription.referenceId })
        .from(subscription)
        .where(and(scopes.billing, inArray(subscription.status, ['active', 'trialing']))),
    ])

  return {
    storeValidated: validatedStores.map(({ organizationId }) => organizationId),
    imported: importedReviews.map(({ organizationId }) => organizationId),
    drafted: drafts.map(({ organizationId }) => organizationId),
    published: published.map(({ organizationId }) => organizationId),
    billingActive: activeSubscriptions.map(({ organizationId }) => organizationId),
  }
}

function buildStageScopes(
  database: ReadDatabase,
  dateRange: DateRange,
  excludedOrganizationIds: readonly string[],
) {
  const cohortOrganizationSubquery = database
    .select({ id: organization.id })
    .from(organization)
    .where(
      and(
        gte(organization.createdAt, dateRange.from),
        lt(organization.createdAt, dateRange.to),
        excludedOrganizationIds.length > 0
          ? notInArray(organization.id, [...excludedOrganizationIds])
          : undefined,
      ),
    )
  return {
    store: inArray(storeConnections.organizationId, cohortOrganizationSubquery),
    review: inArray(reviews.organizationId, cohortOrganizationSubquery),
    draft: inArray(replyDrafts.organizationId, cohortOrganizationSubquery),
    published: inArray(publishedReplies.organizationId, cohortOrganizationSubquery),
    billing: inArray(subscription.referenceId, cohortOrganizationSubquery),
  }
}

function countDistinct(values: Iterable<string>): number {
  return new Set(values).size
}

function countOrganizationsInCohort(
  values: Iterable<string>,
  cohortOrganizationIds: ReadonlySet<string>,
): number {
  return countDistinct(
    Array.from(values).filter((organizationId) => cohortOrganizationIds.has(organizationId)),
  )
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
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
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
  process.stdout
    .write(`Usage: pnpm exec tsx --tsconfig tsconfig.base.json scripts/acquisition-funnel.ts --from YYYY-MM-DD --to YYYY-MM-DD [options]

Options:
  --from YYYY-MM-DD          Inclusive Organization cohort start.
  --to YYYY-MM-DD            Exclusive Organization cohort end.
  --exclude-org-id ID        Exclude an internal Organization (repeatable or comma-separated).
  --help                     Show this help.

DATABASE_URL must be set by the operator. The command only reads the database and prints aggregate JSON.\n`)
}

async function main(): Promise<void> {
  const options = parseMainOptions(process.argv.slice(2))
  if (options === null) {
    return
  }
  const database = createDatabase(requireDatabaseUrl())
  const result = await collectAndCloseReport(database, options)
  if (result.databaseError !== undefined) {
    throw new Error(result.databaseError)
  }
  if (result.report === undefined) {
    throw new Error('The acquisition funnel report did not produce a result.')
  }
  process.stdout.write(`${JSON.stringify(result.report, null, 2)}\n`)
}

function parseMainOptions(argv: readonly string[]): CliOptions | null {
  try {
    return parseCliArguments(argv)
  } catch (error) {
    if (!(error instanceof HelpRequestedError)) {
      throw error
    }
    printHelp()
    return null
  }
}

function requireDatabaseUrl(): string {
  const databaseUrl = process.env['DATABASE_URL']
  if (databaseUrl === undefined || databaseUrl.length === 0) {
    throw new Error('DATABASE_URL must be set by the operator.')
  }
  return databaseUrl
}

async function collectAndCloseReport(
  database: Database,
  options: CliOptions,
): Promise<{ report?: AcquisitionFunnelReport; databaseError?: string }> {
  const collection = await collectReport(database, options)
  const closeError = await closeReport(database)
  if (collection.databaseError !== undefined) {
    return collection
  }
  if (closeError !== undefined) {
    return { databaseError: closeError }
  }
  return collection
}

async function collectReport(
  database: Database,
  options: CliOptions,
): Promise<{ report?: AcquisitionFunnelReport; databaseError?: string }> {
  try {
    return {
      report: await collectFunnelReport(
        database,
        options.dateRange,
        options.excludedOrganizationIds,
      ),
    }
  } catch {
    return {
      databaseError:
        'Could not collect the acquisition funnel report because a database query failed.',
    }
  }
}

async function closeReport(database: Database): Promise<string | undefined> {
  let error: string | undefined
  try {
    await closeDatabase(database)
  } catch {
    error = 'Could not close the acquisition funnel database connection.'
  }
  return error
}

const invokedScript = process.argv[1]
if (invokedScript !== undefined && import.meta.url === pathToFileURL(invokedScript).href) {
  try {
    await main()
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Acquisition funnel report failed.'}\n`,
    )
    process.exitCode = 1
  }
}
