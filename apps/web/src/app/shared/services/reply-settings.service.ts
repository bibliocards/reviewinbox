import { HttpClient } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import type { ReplySettingsResponse, UpdateReplySettingsRequest } from '@reviewinbox/contracts'
import type { Observable } from 'rxjs'
import { environment } from '../../../environments/environment'
import { resolveOptionalString } from '../../../environments/environment.model'

@Injectable({ providedIn: 'root' })
export class ReplySettingsService {
  private readonly http = inject(HttpClient)
  private readonly apiUrl = resolveOptionalString(environment.apiUrl) ?? ''

  getReplySettings(appId: string): Observable<ReplySettingsResponse> {
    return this.http.get<ReplySettingsResponse>(`${this.apiUrl}/api/apps/${appId}/reply-settings`)
  }

  updateReplySettings(appId: string, input: UpdateReplySettingsRequest): Observable<ReplySettingsResponse> {
    return this.http.patch<ReplySettingsResponse>(`${this.apiUrl}/api/apps/${appId}/reply-settings`, input)
  }
}
