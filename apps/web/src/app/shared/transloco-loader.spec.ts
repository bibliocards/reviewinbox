// oxlint-disable-next-line import/no-unassigned-import -- Angular's partially compiled providers need the JIT compiler in Node tests.
import '@angular/compiler'
import { HttpClient, HttpResponse, type HttpRequest } from '@angular/common/http'
import { Injector } from '@angular/core'
import { TRANSLOCO_LOADER } from '@jsverse/transloco'
import { firstValueFrom, of } from 'rxjs'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { TranslocoHttpLoader } from './transloco-loader'

const labelsSchema = z.object({
  organization: z.object({ title: z.string(), usage: z.object({ currentPlan: z.string() }) }),
  shell: z.object({ organization: z.object({ plan: z.string() }) }),
})

function browserCache(current: z.infer<typeof labelsSchema>) {
  const stale = { organization: { profile: {} }, shell: {} }
  const requests: HttpRequest<unknown>[] = []
  const http = new HttpClient({
    handle(request: HttpRequest<unknown>) {
      requests.push(request)
      // A fresh browser cache entry is reused unless the request asks for revalidation.
      const body = request.headers.get('Cache-Control') === 'no-cache' ? current : stale
      return of(new HttpResponse({ body }))
    },
  })
  return { http, requests }
}

describe('translations after a deployment', () => {
  it.each([
    { lang: 'en', currentPlan: 'Current plan' },
    { lang: 'fr', currentPlan: 'Offre actuelle' },
  ])(
    'revalidates an old $lang browser cache entry before showing new labels',
    async ({ lang, currentPlan }) => {
      const current = {
        organization: { title: 'Organization', usage: { currentPlan } },
        shell: { organization: { plan: '{{name}} plan' } },
      }
      const cache = browserCache(current)
      const injector = Injector.create({
        providers: [
          { provide: HttpClient, useValue: cache.http },
          { provide: TRANSLOCO_LOADER, useClass: TranslocoHttpLoader },
        ],
      })
      const loader = injector.get(TRANSLOCO_LOADER)

      const translation = await firstValueFrom(loader.getTranslation(lang))

      expect(labelsSchema.parse(translation)).toEqual(current)
      expect(cache.requests).toHaveLength(1)
      expect(cache.requests[0]?.url).toBe(`/i18n/${lang}.json`)
    },
  )
})
