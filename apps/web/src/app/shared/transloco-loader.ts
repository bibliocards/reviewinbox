import { HttpClient } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import type { Translation, TranslocoLoader } from '@jsverse/transloco'

@Injectable({ providedIn: 'root' })
export class TranslocoHttpLoader implements TranslocoLoader {
  private http = inject(HttpClient)

  getTranslation(lang: string) {
    // Revalidate legacy browser cache entries on the first load after deployment.
    return this.http.get<Translation>(`/i18n/${lang}.json`, {
      headers: { 'Cache-Control': 'no-cache' },
    })
  }
}
