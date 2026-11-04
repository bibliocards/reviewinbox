// oxlint-disable-next-line import/no-unassigned-import -- Angular providers need the JIT compiler in Node tests.
import '@angular/compiler'
import { RendererFactory2 } from '@angular/core'
import { TestBed, TestComponentRenderer } from '@angular/core/testing'
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing'
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  storeReplyCharacterLimits,
  type StoreProvider,
} from '../../../../../../../packages/contracts/src/store'
import {
  ReplyDraftDialogComponent,
  type ReplyDraftDialogData,
  type ReplyDraftDialogResult,
} from './reply-draft-dialog.component'

class TestReplyDraftDialog extends ReplyDraftDialogComponent {
  readonly length = this.draftLength
  readonly overLimit = this.exceedsReplyLimit

  edit(text: string): void {
    this.draftForm.draftText().value.set(text)
  }

  save(): void {
    this.submit('save')
  }

  publish(): void {
    this.submit('publish')
  }
}

TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting())
afterEach(() => {
  TestBed.resetTestingModule()
})

function dialogSession(
  provider: StoreProvider,
  draftText = '',
  mode: ReplyDraftDialogData['mode'] = 'manual',
) {
  const close = vi.fn<(result?: ReplyDraftDialogResult) => void>()
  TestBed.configureTestingModule({
    providers: [
      // These tests exercise dialog state and submission without rendering a DOM.
      { provide: RendererFactory2, useValue: {} },
      { provide: TestComponentRenderer, useValue: { removeAllRootElements() {} } },
      { provide: DynamicDialogConfig, useValue: { data: { provider, draftText, mode } } },
      { provide: DynamicDialogRef, useValue: { close } },
    ],
  })
  return { dialog: TestBed.runInInjectionContext(() => new TestReplyDraftDialog()), close }
}

describe('Reply Draft dialog character limits', () => {
  it.each<StoreProvider>(['apple_app_store', 'google_play'])(
    'counts trimmed text and publishes at the %s limit',
    (provider) => {
      const text = 'a'.repeat(storeReplyCharacterLimits[provider])
      const { dialog, close } = dialogSession(provider, `  ${text}\n`)
      expect(dialog.length()).toBe(text.length)
      expect(dialog.overLimit()).toBe(false)
      dialog.publish()
      expect(close).toHaveBeenCalledWith({ action: 'publish', draftText: text })
    },
  )

  it.each<StoreProvider>(['apple_app_store', 'google_play'])(
    'keeps the dialog open above the %s limit and allows correction',
    (provider) => {
      const limit = storeReplyCharacterLimits[provider]
      const { dialog, close } = dialogSession(provider, 'a'.repeat(limit + 1))
      expect(dialog.overLimit()).toBe(true)
      dialog.publish()
      expect(close).not.toHaveBeenCalled()
      dialog.edit('a'.repeat(limit))
      expect(dialog.overLimit()).toBe(false)
      dialog.publish()
      expect(close).toHaveBeenCalledWith({ action: 'publish', draftText: 'a'.repeat(limit) })
    },
  )

  it('still allows saving a Google Play draft above its publication limit', () => {
    const draftText = 'a'.repeat(storeReplyCharacterLimits.google_play + 1)
    const { dialog, close } = dialogSession('google_play', draftText)
    dialog.save()
    expect(close).toHaveBeenCalledWith({ action: 'save', draftText })
  })

  it.each<ReplyDraftDialogData['mode']>(['manual', 'edit', 'update', 'update-manual'])(
    'guards publication in %s mode',
    (mode) => {
      const { dialog, close } = dialogSession('google_play', 'a'.repeat(351), mode)
      dialog.publish()
      expect(close).not.toHaveBeenCalled()
    },
  )

  it.each(['', ' \n '])('does not save or publish blank text: %j', (text) => {
    const { dialog, close } = dialogSession('google_play', text)
    dialog.save()
    dialog.publish()
    expect(close).not.toHaveBeenCalled()
  })
})
