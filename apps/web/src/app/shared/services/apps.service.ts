import { HttpClient, httpResource } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import type {
  ConnectAppRequest,
  ConnectAppResponse,
  DeleteAppResponse,
  ListAppsResponse,
  QueueMissingReplyDraftsResponse,
  SyncRunResponse,
  UpdateAppRequest,
  UpdateAppResponse,
} from '@reviewinbox/contracts'
import type { Observable } from 'rxjs'
import { environment } from '../../../environments/environment'
import { resolveOptionalString } from '../../../environments/environment.model'

@Injectable({ providedIn: 'root' })
export class AppsService {
  private readonly http = inject(HttpClient)
  private readonly apiUrl = resolveOptionalString(environment.apiUrl) ?? ''

  appsResource() {
    return httpResource<ListAppsResponse>(() => `${this.apiUrl}/api/apps`, { defaultValue: { apps: [] } })
  }

  connectApp(input: ConnectAppRequest): Observable<ConnectAppResponse> {
    return this.http.post<ConnectAppResponse>(`${this.apiUrl}/api/apps/connect`, input)
  }

  updateApp(appId: string, input: UpdateAppRequest): Observable<UpdateAppResponse> {
    return this.http.put<UpdateAppResponse>(`${this.apiUrl}/api/apps/${appId}`, input)
  }

  deleteApp(appId: string): Observable<DeleteAppResponse> {
    return this.http.delete<DeleteAppResponse>(`${this.apiUrl}/api/apps/${appId}`)
  }

  syncStoreConnectionReviews(storeConnectionId: string): Observable<SyncRunResponse> {
    return this.http.post<SyncRunResponse>(`${this.apiUrl}/api/store-connections/${storeConnectionId}/sync-reviews`, {})
  }

  queueMissingReplyDrafts(appId: string): Observable<QueueMissingReplyDraftsResponse> {
    return this.http.post<QueueMissingReplyDraftsResponse>(`${this.apiUrl}/api/apps/${appId}/reply-drafts/queue-missing`, {})
  }
}
