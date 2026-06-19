import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

const fromRoot = (path: string) => resolve(process.cwd(), path)

export default defineConfig({
  test: {
    environment: 'node',
    include: ['apps/api/src/**/*.spec.ts', 'packages/*/src/**/*.spec.ts'],
  },
  resolve: {
    alias: {
      '@reviewinbox/config': fromRoot('packages/config/src/index.ts'),
      '@reviewinbox/contracts': fromRoot('packages/contracts/src/index.ts'),
      '@reviewinbox/core': fromRoot('packages/core/src/index.ts'),
      '@reviewinbox/db': fromRoot('packages/db/src/index.ts'),
    },
  },
})
