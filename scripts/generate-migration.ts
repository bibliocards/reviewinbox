import { spawnSync } from 'node:child_process'
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

import { z } from 'zod'

import { publishMigration } from './publish-migration.js'

const migrations = 'packages/db/migrations'
const journalSchema = z.looseObject({
  entries: z.array(z.looseObject({ idx: z.number(), tag: z.string().regex(/^[\w-]+$/u) })),
})
const snapshotSchema = z.looseObject({ id: z.string(), prevId: z.string() })
type Journal = z.infer<typeof journalSchema>

async function readJournal(directory: string): Promise<Journal> {
  return journalSchema.parse(
    JSON.parse(await readFile(join(directory, 'meta', '_journal.json'), 'utf8')),
  )
}

async function requireSingleSnapshot(): Promise<string> {
  const names = await readdir(join(migrations, 'meta'))
  const unexpected = names.filter((name) => name !== '_journal.json' && name !== 'snapshot.json')
  if (unexpected.length > 0) {
    throw new Error(`Unexpected migration metadata: ${unexpected.join(', ')}`)
  }
  const source = await readFile(join(migrations, 'meta', 'snapshot.json'), 'utf8')
  return snapshotSchema.parse(JSON.parse(source)).id
}

function validateArguments(args: readonly string[]): void {
  if (args.some((arg) => /^--(?:out|config|prefix)(?:=|$)/u.test(arg))) {
    throw new Error(
      'db:generate uses packages/db/drizzle.config.ts, packages/db/migrations/ and the default migration prefix',
    )
  }
}

function runDrizzleGenerate(
  drizzleBin: string,
  configPath: string,
  args: readonly string[],
): string {
  const result = spawnSync(
    process.execPath,
    [drizzleBin, 'generate', ...args, '--config', configPath],
    { encoding: 'utf8' as const, stdio: ['inherit', 'pipe', 'inherit'] },
  )
  const output = result.stdout ?? ''
  process.stdout.write(output)
  if (result.error !== undefined) {
    throw result.error
  }
  if (result.status !== 0) {
    const exitStatus = result.signal === null ? `code ${result.status}` : `signal ${result.signal}`
    throw new Error(`drizzle-kit generate failed with ${exitStatus}`)
  }
  return output
}

async function generate(temporary: string, args: readonly string[]): Promise<string> {
  await cp(migrations, temporary, { recursive: true })
  const configPath = join(temporary, 'drizzle.config.ts')
  // Drizzle Kit 0.31 resolves snapshot paths from cwd, so the temporary out path is relative.
  await writeFile(
    configPath,
    `import config from '../packages/db/drizzle.config'\nexport default { ...config, out: ${JSON.stringify(temporary)} }\n`,
  )
  const drizzleBin = join(dirname(createRequire(import.meta.url).resolve('drizzle-kit')), 'bin.cjs')
  return runDrizzleGenerate(drizzleBin, configPath, args)
}

function requireAppendedMigration(before: Journal, after: Journal): string {
  if (
    after.entries.length !== before.entries.length + 1
    || JSON.stringify(after.entries.slice(0, -1)) !== JSON.stringify(before.entries)
  ) {
    throw new Error('Drizzle changed existing migration history; refusing generated files')
  }
  const entry = after.entries.at(-1)
  if (entry === undefined) {
    throw new Error('Missing generated migration')
  }
  return `${entry.tag}.sql`
}

async function generatedSnapshot(temporary: string, previousId: string): Promise<string> {
  const names = (await readdir(join(temporary, 'meta'))).filter((name) =>
    /^\d+_snapshot\.json$/u.test(name),
  )
  const [name] = names
  if (names.length !== 1 || name === undefined) {
    throw new Error('Expected one generated snapshot')
  }
  const path = join(temporary, 'meta', name)
  const next = snapshotSchema.parse(JSON.parse(await readFile(path, 'utf8')))
  if (next.prevId !== previousId) {
    throw new Error('Generated snapshot has an unexpected parent')
  }
  return path
}

async function publish(
  temporary: string,
  before: Journal,
  previousId: string,
  output: string,
): Promise<void> {
  const after = await readJournal(temporary)
  if (JSON.stringify(after) === JSON.stringify(before)) {
    if (!output.includes('No schema changes, nothing to migrate')) {
      throw new Error('Drizzle produced neither a migration nor a confirmed unchanged schema')
    }
    return
  }
  const sqlName = requireAppendedMigration(before, after)
  const snapshotPath = await generatedSnapshot(temporary, previousId)
  await publishMigration(migrations, temporary, sqlName, snapshotPath)
  process.stdout.write(
    `Migration saved to ${join(migrations, sqlName)}; meta/snapshot.json updated.\n`,
  )
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  validateArguments(args)
  const before = await readJournal(migrations)
  const previousId = await requireSingleSnapshot()
  const temporary = await mkdtemp('.drizzle-generate-')
  try {
    await publish(temporary, before, previousId, await generate(temporary, args))
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

try {
  await main()
} catch (cause) {
  const error = cause instanceof Error ? cause : new Error('Migration generation failed', { cause })
  process.stderr.write(`${error.stack ?? `${error.name}: ${error.message}`}\n`)
  process.exitCode = 1
}
