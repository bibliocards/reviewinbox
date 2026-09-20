import { HttpClient, type HttpResourceRef, httpResource } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import type {
  AnalysisFilters,
  AnalysisResponse,
  AnalysisReview,
  ReportedSeverity,
  ReviewIntent,
  ReviewTopic,
  TopicListResponse,
} from '@reviewinbox/contracts'
import type { Observable } from 'rxjs'

export type { AnalysisReview, ReviewTopic as AnalysisTopic } from '@reviewinbox/contracts'

import { environment } from '../../../environments/environment'
import { resolveOptionalString } from '../../../environments/environment.model'

export type AnalysisSeverity = ReportedSeverity | 'unknown'
export type AnalysisTopicStatus = ReviewTopic['status']
export type AnalysisIntent = ReviewIntent
export type AnalysisSnapshot = AnalysisResponse

@Injectable({ providedIn: 'root' })
export class AnalysisService {
  private readonly http = inject(HttpClient)
  private readonly apiUrl = resolveOptionalString(environment.apiUrl) ?? ''

  analysisResource(params: () => AnalysisFilters): HttpResourceRef<AnalysisSnapshot> {
    return httpResource<AnalysisSnapshot>(
      () => `${this.apiUrl}/api/analysis?${toQueryString(params())}`,
      { defaultValue: emptySnapshot() },
    )
  }

  topicsResource(appId: () => string | undefined): HttpResourceRef<TopicListResponse> {
    return httpResource<TopicListResponse>(
      () => {
        const id = appId()
        return id === undefined ? undefined : `${this.apiUrl}/api/apps/${id}/topics`
      },
      { defaultValue: { topics: [], canManage: false, discoveryEnabled: false } },
    )
  }

  reviewAnalysis(reviewId: string): Observable<AnalysisReview> {
    return this.http.get<AnalysisReview>(`${this.apiUrl}/api/analysis/reviews/${reviewId}`)
  }

  topics(appId: string): Observable<TopicListResponse> {
    return this.http.get<TopicListResponse>(`${this.apiUrl}/api/apps/${appId}/topics`)
  }

  createTopic(
    appId: string,
    input: { label: string; description: string; status?: AnalysisTopicStatus },
  ): Observable<unknown> {
    return this.http.post(`${this.apiUrl}/api/apps/${appId}/topics`, input)
  }

  updateTopic(
    appId: string,
    topicId: string,
    input: { label?: string; description?: string; status?: AnalysisTopicStatus },
  ): Observable<unknown> {
    return this.http.patch(`${this.apiUrl}/api/apps/${appId}/topics/${topicId}`, input)
  }

  mergeTopics(appId: string, topicId: string, targetTopicId: string): Observable<unknown> {
    return this.http.post(`${this.apiUrl}/api/apps/${appId}/topics/${topicId}/merge`, {
      targetTopicId,
    })
  }

  discoverTopics(appId: string): Observable<unknown> {
    return this.http.post(`${this.apiUrl}/api/apps/${appId}/topics/discover`, {})
  }

  updateReviewClassification(
    reviewId: string,
    input: { severity: ReportedSeverity | null; intents: AnalysisIntent[]; topicIds: string[] },
  ): Observable<unknown> {
    return this.http.put(`${this.apiUrl}/api/analysis/reviews/${reviewId}/override`, {
      severity: input.severity,
      intents: input.intents,
      topicIds: input.topicIds,
    })
  }

  resetReviewClassification(reviewId: string): Observable<unknown> {
    return this.http.delete(`${this.apiUrl}/api/analysis/reviews/${reviewId}/override`)
  }
}

function toQueryString(params: AnalysisFilters): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      query.set(key, String(value))
    }
  }
  return query.toString()
}

function emptySnapshot(): AnalysisSnapshot {
  return {
    enabled: false,
    discoveryEnabled: false,
    canManage: false,
    total: 0,
    analyzed: 0,
    page: 1,
    pageSize: 25,
    severities: [],
    topics: [],
    trend: [],
    versions: [],
    reviews: [],
  }
}
