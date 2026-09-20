import { constants } from 'node:fs'
import { copyFile, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

type Backup = Readonly<{ path: string; contents: Buffer }>

async function backup(path: string): Promise<Backup> {
  return { path, contents: await readFile(path) }
}

function asError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error('Migration publication failed', { cause })
}

async function rollback(
  sqlPath: string,
  backups: readonly Backup[],
  cause: unknown,
): Promise<never> {
  const publicationError = asError(cause)
  const restored = await Promise.allSettled([
    rm(sqlPath, { force: true }),
    ...backups.map((file) => writeFile(file.path, file.contents)),
  ])
  const failures = restored
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .map((result) => asError(result.reason))
  if (failures.length > 0) {
    throw new AggregateError(
      [publicationError, ...failures],
      'Migration publication and rollback failed',
      { cause: publicationError },
    )
  }
  throw publicationError
}

export async function publishMigration(
  migrations: string,
  temporary: string,
  sqlName: string,
  snapshotPath: string,
): Promise<void> {
  const snapshot = await backup(join(migrations, 'meta', 'snapshot.json'))
  const journal = await backup(join(migrations, 'meta', '_journal.json'))
  const sqlPath = join(migrations, sqlName)
  await copyFile(join(temporary, sqlName), sqlPath, constants.COPYFILE_EXCL)
  try {
    await rename(snapshotPath, snapshot.path)
    await rename(join(temporary, 'meta', '_journal.json'), journal.path)
  } catch (cause) {
    await rollback(sqlPath, [snapshot, journal], cause)
  }
}
