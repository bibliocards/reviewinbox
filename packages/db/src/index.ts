import { resolve } from 'node:path'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'

import * as databaseSchema from './schema'

export * from './schema'
export { databaseSchema }

export type Database = ReturnType<typeof createDatabase>

export function createDatabase(databaseUrl: string) {
  const pool = new pg.Pool({ connectionString: databaseUrl })

  return drizzle(pool, { schema: databaseSchema })
}

export async function runDatabaseMigrations(databaseUrl: string, migrationsFolder = resolve(process.cwd(), 'packages/db/migrations')) {
  const pool = new pg.Pool({ connectionString: databaseUrl })

  try {
    await migrate(drizzle(pool), { migrationsFolder })
  } finally {
    await pool.end()
  }
}
