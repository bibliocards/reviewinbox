import * as files from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { publishMigration } from './publish-migration.js'

let root: string
let migrations: string
let temporary: string

beforeEach(async () => {
  root = await files.mkdtemp(join(tmpdir(), 'reviewinbox-migration-'))
  migrations = join(root, 'migrations')
  temporary = join(root, 'generated')
  await files.mkdir(join(migrations, 'meta'), { recursive: true })
  await files.mkdir(join(temporary, 'meta'), { recursive: true })
  await files.writeFile(join(migrations, 'meta', 'snapshot.json'), 'old snapshot')
  await files.writeFile(join(migrations, 'meta', '_journal.json'), 'old journal')
  await files.writeFile(join(temporary, 'meta', 'next_snapshot.json'), 'new snapshot')
  await files.writeFile(join(temporary, 'meta', '_journal.json'), 'new journal')
  await files.writeFile(join(temporary, '0001_test.sql'), 'new sql')
})

afterEach(async () => {
  await files.rm(root, { recursive: true, force: true })
})

describe('publishMigration', () => {
  it('restores the prior migration history when metadata publication fails', async () => {
    await files.rm(join(temporary, 'meta', '_journal.json'))

    await expect(
      publishMigration(
        migrations,
        temporary,
        '0001_test.sql',
        join(temporary, 'meta', 'next_snapshot.json'),
      ),
    ).rejects.toThrow('ENOENT')

    expect(await files.readFile(join(migrations, 'meta', 'snapshot.json'), 'utf8')).toBe(
      'old snapshot',
    )
    expect(await files.readFile(join(migrations, 'meta', '_journal.json'), 'utf8')).toBe(
      'old journal',
    )
    await expect(files.readFile(join(migrations, '0001_test.sql'))).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })

  it('does not overwrite an existing migration SQL file', async () => {
    await files.writeFile(join(migrations, '0001_test.sql'), 'existing sql')

    await expect(
      publishMigration(
        migrations,
        temporary,
        '0001_test.sql',
        join(temporary, 'meta', 'next_snapshot.json'),
      ),
    ).rejects.toMatchObject({ code: 'EEXIST' })

    expect(await files.readFile(join(migrations, '0001_test.sql'), 'utf8')).toBe('existing sql')
    expect(await files.readFile(join(migrations, 'meta', 'snapshot.json'), 'utf8')).toBe(
      'old snapshot',
    )
    expect(await files.readFile(join(migrations, 'meta', '_journal.json'), 'utf8')).toBe(
      'old journal',
    )
  })

  it('publishes SQL and metadata together', async () => {
    await publishMigration(
      migrations,
      temporary,
      '0001_test.sql',
      join(temporary, 'meta', 'next_snapshot.json'),
    )

    expect(await files.readFile(join(migrations, '0001_test.sql'), 'utf8')).toBe('new sql')
    expect(await files.readFile(join(migrations, 'meta', 'snapshot.json'), 'utf8')).toBe(
      'new snapshot',
    )
    expect(await files.readFile(join(migrations, 'meta', '_journal.json'), 'utf8')).toBe(
      'new journal',
    )
  })
})
