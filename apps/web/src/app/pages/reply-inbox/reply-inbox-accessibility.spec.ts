/// <reference types="node" />
import { readFileSync } from 'node:fs'

import {
  parseTemplate,
  TmplAstElement,
  TmplAstIfBlock,
  TmplAstTemplate,
  type TmplAstNode,
} from '@angular/compiler'
import { describe, expect, it } from 'vitest'

const template = readFileSync(new URL('./reply-inbox.page.html', import.meta.url), 'utf8')

// Do not descend into control-flow blocks: the live region must exist before feedback arrives.
function unconditionalElements(nodes: TmplAstNode[]): TmplAstElement[] {
  return nodes.flatMap((node) => {
    if (node instanceof TmplAstElement) {
      return [node, ...unconditionalElements(node.children)]
    }
    if (node instanceof TmplAstTemplate) {
      return unconditionalElements(node.children)
    }
    return []
  })
}

describe('Reply Inbox action feedback accessibility', () => {
  it('keeps a polite, atomic status region mounted outside conditional content', () => {
    const parsed = parseTemplate(template, 'reply-inbox.page.html')
    expect(parsed.errors).toBeNull()

    const regions = unconditionalElements(parsed.nodes).filter(
      (element) =>
        Object.fromEntries(element.attributes.map(({ name, value }) => [name, value])).role
        === 'status',
    )
    expect(regions).toHaveLength(1)
    const region = regions[0]
    const attributes = Object.fromEntries(region.attributes.map(({ name, value }) => [name, value]))
    expect(attributes).toMatchObject({
      'aria-live': 'polite',
      'aria-atomic': 'true',
      class: 'contents',
    })

    const feedback = region.children.find((node) => node instanceof TmplAstIfBlock)
    expect(feedback).toBeDefined()
    expect(feedback?.sourceSpan.toString()).toContain('@if (message(); as currentMessage)')
    expect(feedback?.branches[0]?.expressionAlias?.name).toBe('currentMessage')
    expect(feedback?.sourceSpan.toString()).toContain('{{ t(currentMessage.key) }}')
  })
})
