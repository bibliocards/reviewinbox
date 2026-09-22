/// <reference types="node" />
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

// PrimeNG forwards ariaLabel to its native button. An attr.aria-label binding
// instead labels only the non-focusable p-button host.
describe('header button accessible labels', () => {
  it.each([
    {
      template: new URL('./app-shell.component.html', import.meta.url),
      className: 'owner-button',
      label: "t('shell.menu.ownerAria')",
    },
    {
      template: new URL(
        '../shared/components/theme-toggle/theme-toggle.component.html',
        import.meta.url,
      ),
      className: 'theme-button',
      label: 't(themeLabel())',
    },
  ])(
    'forwards the translated label to the $className native button',
    ({ template, className, label }) => {
      const source = readFileSync(template, 'utf8')
      const button = source
        .match(/<p-button\b[^>]*>/gu)
        ?.find((tag) => tag.includes(`class="${className}"`))

      expect(button).toBeDefined()
      expect(button).toContain(`[ariaLabel]="${label}"`)
      expect(button).not.toContain('[attr.aria-label]')
    },
  )
})
