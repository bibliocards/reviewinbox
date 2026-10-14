/// <reference types="node" />

import { readFileSync } from 'node:fs'

import {
  parseTemplate,
  TmplAstElement,
  TmplAstForLoopBlock,
  TmplAstIfBlock,
  TmplAstTemplate,
  type TmplAstNode,
} from '@angular/compiler'
import { parse } from 'postcss'
import { describe, expect, it } from 'vitest'

const template = readFileSync(new URL('./app-shell.component.html', import.meta.url), 'utf8')
const styles = readFileSync(new URL('./app-shell.component.css', import.meta.url), 'utf8')

function elementsIn(nodes: TmplAstNode[]): TmplAstElement[] {
  return nodes.flatMap((node) => {
    if (node instanceof TmplAstElement) {
      return [node, ...elementsIn(node.children)]
    }
    if (node instanceof TmplAstTemplate || node instanceof TmplAstForLoopBlock) {
      return elementsIn(node.children)
    }
    if (node instanceof TmplAstIfBlock) {
      return node.branches.flatMap((branch) => elementsIn(branch.children))
    }
    return []
  })
}

const parsed = parseTemplate(template, 'app-shell.component.html')
const links = elementsIn(parsed.nodes).filter((element) => element.name === 'a')
const classesOf = (element: TmplAstElement | undefined) =>
  element?.attributes.find((attribute) => attribute.name === 'class')?.value.split(/\s+/u) ?? []

function sidebarOutlineDeclarations(): string[] {
  const declarations: string[] = []
  parse(styles).walkRules((rule) => {
    if (rule.selector.includes('.nav-item') || rule.selector.includes('.sidebar-link-icon')) {
      rule.walkDecls(/^outline(?:-|$)/u, (declaration) => {
        declarations.push(declaration.toString())
      })
    }
  })
  return declarations
}

describe('sidebar keyboard focus', () => {
  it('keeps an inset focus ring on navigation links, including the active page', () => {
    expect(parsed.errors).toBeNull()
    const navigationLinks = links.filter((link) => classesOf(link).includes('nav-item'))
    expect(navigationLinks).toHaveLength(1)
    expect(classesOf(navigationLinks[0])).toEqual(
      expect.arrayContaining([
        'focus-visible:outline-2',
        'focus-visible:-outline-offset-2',
        'focus-visible:outline-linear-primary',
      ]),
    )
    expect(navigationLinks[0]?.attributes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'ariaCurrentWhenActive', value: 'page' }),
      ]),
    )
  })

  it('gives each sidebar icon link a visible focus ring', () => {
    const iconLinks = links.filter((link) => classesOf(link).includes('sidebar-link-icon'))
    expect(iconLinks).toHaveLength(3)
    for (const link of iconLinks) {
      expect(classesOf(link)).toEqual(
        expect.arrayContaining([
          'focus-visible:outline-2',
          'focus-visible:outline-offset-2',
          'focus-visible:outline-linear-primary',
        ]),
      )
    }
  })

  it('does not override the Tailwind outline utilities with unlayered component styles', () => {
    expect(sidebarOutlineDeclarations()).toEqual([])
  })
})
