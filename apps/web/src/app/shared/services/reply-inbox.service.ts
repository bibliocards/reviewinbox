import { HttpClient, type HttpResourceRef, httpResource } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import type {
  ListReplyInboxResponse,
  PublishReplyRequest,
  QueueReplyDraftResponse,
  ReplyActionResponse,
  SaveReplyDraftRequest,
} from '@reviewinbox/contracts'
import type { Observable } from 'rxjs'
import { environment } from '../../../environments/environment'
import { resolveOptionalString } from '../../../environments/environment.model'

@Injectable({ providedIn: 'root' })
export class ReplyInboxService {
  private readonly http = inject(HttpClient)
  private readonly apiUrl = resolveOptionalString(environment.apiUrl) ?? ''

  replyInboxResource(params: () => { appId?: string; filter: string }): HttpResourceRef<ListReplyInboxResponse> {
    return httpResource<ListReplyInboxResponse>(() => `${this.apiUrl}/api/reply-inbox?${toQueryString(params())}`, {
      defaultValue: { reviews: [] },
    })
  }

  queueDraft(reviewId: string): Observable<QueueReplyDraftResponse> {
    return this.http.post<QueueReplyDraftResponse>(`${this.apiUrl}/api/reply-inbox/${reviewId}/draft/queue`, {})
  }

  saveDraft(reviewId: string, input: SaveReplyDraftRequest): Observable<ReplyActionResponse> {
    return this.http.put<ReplyActionResponse>(`${this.apiUrl}/api/reply-inbox/${reviewId}/draft`, input)
  }

  publishReply(reviewId: string, input: PublishReplyRequest = {}): Observable<ReplyActionResponse> {
    return this.http.post<ReplyActionResponse>(`${this.apiUrl}/api/reply-inbox/${reviewId}/publish`, input)
  }

  ignoreReview(reviewId: string): Observable<ReplyActionResponse> {
    return this.http.post<ReplyActionResponse>(`${this.apiUrl}/api/reply-inbox/${reviewId}/ignore`, {})
  }

  unignoreReview(reviewId: string): Observable<ReplyActionResponse> {
    return this.http.post<ReplyActionResponse>(`${this.apiUrl}/api/reply-inbox/${reviewId}/unignore`, {})
  }
}

function toQueryString(params: { appId?: string; filter: string }) {
  const query = new URLSearchParams({ filter: params.filter })
  if (params.appId) {
    query.set('appId', params.appId)
  }
  return query.toString()
}
