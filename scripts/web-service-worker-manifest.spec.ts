import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const hash = (value: string) => createHash('sha1').update(value).digest('hex')

describe('web runtime service worker manifest', () => {
  it('matches substituted bundles on startup and restart without changing translations', () => {
    const directory = mkdtempSync(join(tmpdir(), 'reviewinbox-ngsw-'))
    try {
      const template = 'export const apiUrl = "${REVIEWINBOX_API_URL}"'
      const translations = '{"analysis":{"title":"Analysis"}}'
      const manifest = JSON.stringify({
        hashTable: { '/main.js': hash(template), '/i18n/en.json': hash(translations) },
      })
      writeFileSync(join(directory, 'main.js.template'), template)
      writeFileSync(join(directory, 'ngsw.json.build'), manifest)
      for (const apiUrl of ['https://first.example', 'https://second.example']) {
        const bundle = template.replace('${REVIEWINBOX_API_URL}', apiUrl)
        writeFileSync(join(directory, 'main.js'), bundle)
        execFileSync('sh', [resolve('apps/web/40-update-ngsw-manifest.sh')], {
          env: { ...process.env, NGINX_ENVSUBST_OUTPUT_DIR: directory },
        })
        const result: unknown = JSON.parse(readFileSync(join(directory, 'ngsw.json'), 'utf8'))
        expect(result).toEqual({
          hashTable: { '/main.js': hash(bundle), '/i18n/en.json': hash(translations) },
        })
      }
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
