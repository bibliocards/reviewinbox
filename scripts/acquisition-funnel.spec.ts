import type { Database } from '@reviewinbox/db'
import { member, organization, publishedReplies, replyDrafts, reviews, storeConnections, subscription, user } from '@reviewinbox/db'
import { drizzle } from 'drizzle-orm/node-postgres'
import { describe, expect, it } from 'vitest'
import { buildFunnelReport, collectFunnelReport, parseCliArguments, parseDateRange } from './acquisition-funnel'

describe('acquisition funnel report', () => {
  it('keeps User volume separate and uses one Organization denominator for every rate', () => {
    const report = buildFunnelReport(parseDateRange('2026-09-01', '2026-10-01'), {
      userIds: ['user-1', 'user-1', 'user-2'],
      organizationIds: ['org-1', 'org-2'],
      storeValidatedOrganizationIds: ['org-1', 'org-1', 'outside-org'],
      importedOrganizationIds: ['org-1'],
      draftedOrganizationIds: ['org-2'],
      publishedOrganizationIds: ['outside-org'],
      billingActiveOrganizationIds: ['org-1', 'org-2'],
    })

    expect(report.counts).toEqual({
      user_registered: 2,
      organization_created: 2,
      store_validated: 1,
      first_import: 1,
      first_draft: 1,
      first_published: 0,
      returned: null,
      billing_active: 2,
    })
    expect(report.rates).toEqual({
      storeValidatedFromOrganization: {
        numerator: 1,
        denominator: 2,
        denominatorStage: 'organization_created',
        value: 0.5,
      },
      firstImportFromOrganization: {
        numerator: 1,
        denominator: 2,
        denominatorStage: 'organization_created',
        value: 0.5,
      },
      firstDraftFromOrganization: {
        numerator: 1,
        denominator: 2,
        denominatorStage: 'organization_created',
        value: 0.5,
      },
      firstPublishedFromOrganization: {
        numerator: 0,
        denominator: 2,
        denominatorStage: 'organization_created',
        value: 0,
      },
      billingActiveFromOrganization: {
        numerator: 2,
        denominator: 2,
        denominatorStage: 'organization_created',
        value: 1,
      },
    })
  })

  it('returns null for rates with no Organization cohort', () => {
    const report = buildFunnelReport(parseDateRange('2026-09-01', '2026-10-01'), {
      userIds: ['user-1'],
      organizationIds: [],
      storeValidatedOrganizationIds: ['outside-org'],
      importedOrganizationIds: ['outside-org'],
      draftedOrganizationIds: ['outside-org'],
      publishedOrganizationIds: ['outside-org'],
      billingActiveOrganizationIds: ['outside-org'],
    })

    expect(report.counts).toMatchObject({ user_registered: 1, organization_created: 0 })
    expect(Object.values(report.rates).every((rate) => rate.value === null && rate.denominator === 0)).toBe(true)
  })

  it('parses repeated and comma-separated internal Organization exclusions', () => {
    const options = parseCliArguments([
      '--from',
      '2026-09-01',
      '--to=2026-10-01',
      '--exclude-org-id',
      'internal-1, internal-2',
      '--exclude-org-id=internal-1',
    ])

    expect(options.dateRange).toEqual(parseDateRange('2026-09-01', '2026-10-01'))
    expect(options.excludedOrganizationIds).toEqual(['internal-1', 'internal-2'])
  })

  it('does not echo arbitrary command-line values in option errors', () => {
    expect(() => parseCliArguments(['--database-url=postgres://secret.example.test'])).toThrow('Unknown command-line option.')
  })

  it('rejects an exclusion that contains no Organization ID', () => {
    expect(() => parseCliArguments(['--from', '2026-09-01', '--to', '2026-10-01', '--exclude-org-id', ' , , '])).toThrow(
      '--exclude-org-id requires at least one Organization ID.',
    )
  })

  it('keeps actual stage queries bounded for a 70k Organization cohort', async () => {
    const queries: { text: string; params: unknown[] }[] = []
    const client = {
      query: async (config: { text: string }, params: unknown[] = []) => {
        queries.push({ text: config.text, params })
        const selectQueryCount = queries.filter((query) => query.text.startsWith('select')).length
        return { rows: selectQueryCount === 1 ? Array.from({ length: 70_000 }, (_, index) => [`org-${index}`]) : [] }
      },
    }
    const database = drizzle(client as never) as unknown as Database
    const report = await collectFunnelReport(database, parseDateRange('2026-09-01', '2026-10-01'), ['org-0'])

    expect(report.counts.organization_created).toBe(69_999)
    expect(queries).toHaveLength(10)
    expect(queries[0]?.text).toMatch(/^begin isolation level repeatable read read only$/)
    expect(queries.at(-1)?.text).toBe('commit')
    expect(queries.every((query) => query.params.length <= 5)).toBe(true)
    for (const query of queries.filter((query) => query.text.startsWith('select')).slice(3)) {
      expect(query.text).toContain('in (select "id" from "organization"')
      expect(query.text).toContain('"organization"."id" not in')
      expect(query.params).toContain('org-0')
    }
  })

  it('keeps validation in an earlier cohort after credential rotation', async () => {
    const database = createFixtureDatabase({
      organizations: [{ id: 'org-1' }, { id: 'org-2' }],
      users: [{ userId: 'user-1' }, { userId: 'user-2' }],
      storeValidations: [
        {
          organizationId: 'org-1',
          createdAt: new Date('2026-09-12T00:00:00.000Z'),
          // The replacement happened after the cutoff; the API preserves createdAt.
          updatedAt: new Date('2026-10-05T00:00:00.000Z'),
        },
        {
          organizationId: 'org-2',
          createdAt: new Date('2026-10-02T00:00:00.000Z'),
        },
      ],
      storeValidationCutoff: new Date('2026-10-01T00:00:00.000Z'),
    })

    const report = await collectFunnelReport(database, parseDateRange('2026-09-01', '2026-10-01'))

    expect(report.counts.store_validated).toBe(1)
  })

  it('reports persisted Reviews after a credential deletion without inferring validation', async () => {
    const database = createFixtureDatabase({
      organizations: [{ id: 'org-1' }],
      users: [{ userId: 'user-1' }],
      storeValidations: [],
      reviews: [{ organizationId: 'org-1' }],
    })

    const report = await collectFunnelReport(database, parseDateRange('2026-09-01', '2026-10-01'))

    expect(report.counts.store_validated).toBe(0)
    expect(report.counts.first_import).toBe(1)
  })
})

type Fixture = {
  organizations: readonly { id: string }[]
  users: readonly { userId: string }[]
  storeValidations: readonly { organizationId: string; createdAt?: Date; updatedAt?: Date }[]
  storeValidationCutoff?: Date
  reviews?: readonly { organizationId: string }[]
}

function createFixtureDatabase(fixture: Fixture): Database {
  const rowsByTable = new Map<unknown, readonly Record<string, unknown>[]>([
    [organization, fixture.organizations],
    [user, fixture.users],
    [member, []],
    [storeConnections, fixture.storeValidations],
    [reviews, fixture.reviews ?? []],
    [replyDrafts, []],
    [publishedReplies, []],
    [subscription, []],
  ])

  const select = () => ({
    from: (table: unknown) => {
      const rows = rowsByTable.get(table) ?? []
      const cutoff = fixture.storeValidationCutoff
      const filteredRows =
        table === storeConnections && cutoff ? rows.filter(({ createdAt }) => !(createdAt instanceof Date) || createdAt < cutoff) : rows
      const query = {
        innerJoin: () => query,
        where: async () => filteredRows,
      }
      return query
    },
  })
  const snapshot = { select, selectDistinct: select }
  async function transaction<T>(callback: (tx: typeof snapshot) => Promise<T>): Promise<T> {
    return callback(snapshot)
  }
  return { ...snapshot, transaction } as unknown as Database
}
