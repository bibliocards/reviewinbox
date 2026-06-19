import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'

import * as databaseSchema from './schema'

export { databaseSchema }
export * from './schema'

export type Database = ReturnType<typeof createDatabase>

export function createDatabase(databaseUrl: string) {
  const pool = new pg.Pool({ connectionString: databaseUrl })

  return drizzle(pool, { schema: databaseSchema })
}
