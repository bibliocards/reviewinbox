import { randomUUID } from 'node:crypto'

import {
  apps,
  closeDatabase,
  createDatabase,
  organization,
  storeConnections,
  syncRuns,
} from '@reviewinbox/db'
import { inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createAppListStoreConnectionsQuery } from './apps'

const databaseUrl = process.env['ANALYSIS_TEST_DATABASE_URL']
const database = createDatabase(databaseUrl ?? 'postgres://unused-apps-list-test')
const organizationId = `apps-list-${randomUUID()}`
const otherOrganizationId = `apps-list-${randomUUID()}`
const appId = randomUUID()
const otherAppId = randomUUID()
const connectionId = `1${randomUUID().slice(1)}`
const emptyConnectionId = `2${randomUUID().slice(1)}`
const otherConnectionId = randomUUID()
const lastSuccessfulSyncAt = new Date('2026-10-01T12:00:00Z')
const latestCreatedAt = new Date('2026-10-01T13:00:00Z')
const latestRunId = `f${randomUUID().slice(1)}`

beforeAll(async () => {
  if (databaseUrl === undefined) {
    return
  }
  await database
    .insert(organization)
    .values(
      [organizationId, otherOrganizationId].map((id) => ({
        id,
        name: 'Apps List',
        slug: id,
        createdAt: new Date(),
      })),
    )
  await database.insert(apps).values([
    { id: appId, organizationId, name: 'App' },
    { id: otherAppId, organizationId: otherOrganizationId, name: 'Other App' },
  ])
  await database.insert(storeConnections).values([
    { id: connectionId, appId, organizationId, provider: 'apple_app_store' },
    { id: emptyConnectionId, appId, organizationId, provider: 'google_play' },
    {
      id: otherConnectionId,
      appId: otherAppId,
      organizationId: otherOrganizationId,
      provider: 'google_play',
    },
  ])
})

afterAll(async () => {
  if (databaseUrl === undefined) {
    return
  }
  await database
    .delete(organization)
    .where(inArray(organization.id, [organizationId, otherOrganizationId]))
  await closeDatabase(database)
})

describe.skipIf(databaseUrl === undefined)('App list Sync Run selection', () => {
  it('keeps one row per scoped Store Connection and summarizes its full scoped history', async () => {
    const scope = { organizationId, appId, storeConnectionId: connectionId }
    await database.insert(syncRuns).values([
      {
        ...scope,
        status: 'succeeded',
        createdAt: new Date('2026-10-01T10:00:00Z'),
        finishedAt: lastSuccessfulSyncAt,
      },
      {
        ...scope,
        status: 'succeeded',
        createdAt: new Date('2026-10-01T11:00:00Z'),
        finishedAt: new Date('2026-10-01T11:30:00Z'),
      },
      { ...scope, id: `1${randomUUID().slice(1)}`, status: 'pending', createdAt: latestCreatedAt },
      {
        ...scope,
        id: latestRunId,
        status: 'failed',
        createdAt: latestCreatedAt,
        finishedAt: new Date('2026-10-01T13:05:00Z'),
      },
      {
        // The individual foreign keys allow a mismatched Organization on a Sync Run.
        ...scope,
        organizationId: otherOrganizationId,
        status: 'succeeded',
        createdAt: new Date('2026-10-01T14:00:00Z'),
        finishedAt: new Date('2026-10-01T14:05:00Z'),
      },
    ])

    const rows = await createAppListStoreConnectionsQuery(database, organizationId)
    expect(rows.map((row) => row.connection.id)).toEqual([connectionId, emptyConnectionId])
    expect(rows.find((row) => row.connection.id === connectionId)).toMatchObject({
      lastSyncRun: { id: latestRunId, status: 'failed', createdAt: latestCreatedAt },
      lastSuccessfulSyncAt,
    })
    expect(rows.find((row) => row.connection.id === emptyConnectionId)).toMatchObject({
      lastSyncRun: null,
      lastSuccessfulSyncAt: null,
    })
  })
})
