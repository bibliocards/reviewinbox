import { NgClass } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core'
import { ActivatedRoute, Router, RouterLink } from '@angular/router'
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco'
import {
  analysisProviderSchema,
  reportedSeveritySchema,
  reviewIntentSchema,
  type AnalysisFilters,
  type AnalysisReview,
  type AppListItemResponse,
} from '@reviewinbox/contracts'
import { DialogService } from 'primeng/dynamicdialog'
import { z } from 'zod'

import type { AppSelectOption } from '../../shared/components/app-select/app-select.component'
import {
  AnalysisService,
  type AnalysisIntent,
  type AnalysisSeverity,
} from '../../shared/services/analysis.service'
import { AppIconsService } from '../../shared/services/app-icons.service'
import { AppsService } from '../../shared/services/apps.service'
import { AnalysisFiltersComponent } from './analysis-filters.component'
import { AnalysisOverviewComponent } from './analysis-overview.component'
import { AnalysisReviewsComponent } from './analysis-reviews.component'
import {
  ReviewClassificationDialogComponent,
  type ReviewClassificationDialogResult,
} from './review-classification-dialog.component'

const severities: readonly AnalysisSeverity[] = [
  'none',
  'minor',
  'degraded',
  'blocking',
  'critical',
  'unknown',
]
const intents: readonly AnalysisIntent[] = [
  'report_problem',
  'request_feature',
  'request_help',
  'request_refund',
  'express_satisfaction',
  'express_dissatisfaction',
]

@Component({
  selector: 'ri-analysis-page',
  imports: [
    AnalysisFiltersComponent,
    AnalysisOverviewComponent,
    AnalysisReviewsComponent,
    NgClass,
    RouterLink,
    TranslocoDirective,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './analysis.page.html',
})
export class AnalysisPageComponent {
  private readonly route = inject(ActivatedRoute)
  private readonly router = inject(Router)
  private readonly analysisService = inject(AnalysisService)
  private readonly appsService = inject(AppsService)
  private readonly appIcons = inject(AppIconsService)
  private readonly dialogService = inject(DialogService)
  private readonly transloco = inject(TranslocoService)

  protected readonly selectedAppId = signal(this.route.snapshot.queryParamMap.get('appId') ?? '')
  protected readonly selectedFrom = signal(this.route.snapshot.queryParamMap.get('from') ?? '')
  protected readonly selectedTo = signal(this.route.snapshot.queryParamMap.get('to') ?? '')
  protected readonly selectedProvider = signal(
    this.route.snapshot.queryParamMap.get('provider') ?? '',
  )
  protected readonly selectedVersion = signal(
    this.route.snapshot.queryParamMap.get('version') ?? '',
  )
  protected readonly selectedSeverity = signal(
    this.route.snapshot.queryParamMap.get('severity') ?? '',
  )
  protected readonly selectedIntent = signal(this.route.snapshot.queryParamMap.get('intent') ?? '')
  protected readonly selectedTopicId = signal(
    this.route.snapshot.queryParamMap.get('topicId') ?? '',
  )
  protected readonly selectedTopicStatus = signal(
    this.route.snapshot.queryParamMap.get('topicStatus') ?? '',
  )
  protected readonly selectedPage = signal(parsePage(this.route.snapshot.queryParamMap.get('page')))
  protected readonly pendingAction = signal<string | null>(null)
  protected readonly message = signal<{ type: 'success' | 'error'; key: string } | null>(null)
  protected readonly severities = severities
  protected readonly intents = intents
  protected readonly appsResource = this.appsService.appsResource()
  protected readonly apps = computed<AppListItemResponse[]>(() =>
    this.appsResource.hasValue() ? this.appsResource.value().apps : [],
  )
  protected readonly appOptions = computed<AppSelectOption[]>(() => [
    { label: this.transloco.translate('analysis.filters.allApps'), value: '' },
    ...this.apps().map((app) => ({
      label: app.name,
      value: app.id,
      imageUrl: this.appIcons.iconUrl(app.id),
    })),
  ])
  protected readonly filters = computed<AnalysisFilters>(() => ({
    provider: this.selectedProvider()
      ? analysisProviderSchema.safeParse(this.selectedProvider()).data
      : undefined,
    severity: this.selectedSeverity()
      ? reportedSeveritySchema.or(z.literal('unknown')).safeParse(this.selectedSeverity()).data
      : undefined,
    intent: this.selectedIntent()
      ? reviewIntentSchema.safeParse(this.selectedIntent()).data
      : undefined,
    topicStatus: this.selectedTopicStatus()
      ? z.enum(['pending', 'approved']).safeParse(this.selectedTopicStatus()).data
      : undefined,
    appId: this.selectedAppId() ? z.uuid().safeParse(this.selectedAppId()).data : undefined,
    from: dateToIso(this.selectedFrom(), false),
    to: dateToIso(this.selectedTo(), true),
    version: this.selectedVersion() || undefined,
    topicId: this.selectedTopicId() ? z.uuid().safeParse(this.selectedTopicId()).data : undefined,
    page: this.selectedPage(),
    pageSize: 25,
  }))
  protected readonly analysisResource = this.analysisService.analysisResource(() => this.filters())
  protected readonly analysis = computed(() => this.analysisResource.value())
  protected readonly coverage = computed(() =>
    this.analysis().total
      ? Math.round((this.analysis().analyzed / this.analysis().total) * 100)
      : 0,
  )
  protected readonly versionOptions = computed(() =>
    this.analysis().versions.filter(
      (item) => !this.selectedProvider() || item.provider === this.selectedProvider(),
    ),
  )
  protected readonly storeOptions = computed(() => [
    { label: this.transloco.translate('analysis.filters.allStores'), value: '' },
    { label: this.transloco.translate('apps.stores.apple'), value: 'apple_app_store' },
    { label: this.transloco.translate('apps.stores.google'), value: 'google_play' },
  ])
  protected readonly versionFilterOptions = computed(() => [
    { label: this.transloco.translate('analysis.filters.allVersions'), value: '' },
    ...this.versionOptions().map((item) => ({ label: item.version, value: item.version })),
  ])
  protected readonly severityFilterOptions = computed(() => [
    { label: this.transloco.translate('analysis.filters.allSeverities'), value: '' },
    ...severities.map((severity) => ({
      label: this.transloco.translate('analysis.severity.' + severity),
      value: severity,
    })),
  ])
  protected readonly intentFilterOptions = computed(() => [
    { label: this.transloco.translate('analysis.filters.allIntents'), value: '' },
    ...intents.map((intent) => ({
      label: this.transloco.translate('analysis.intents.' + intent),
      value: intent,
    })),
  ])
  protected readonly topicFilterOptions = computed(() => [
    { label: this.transloco.translate('analysis.filters.allTopics'), value: '' },
    ...this.analysis().topics.map((topic) => ({ label: topic.label, value: topic.id })),
  ])
  protected readonly topicStatusOptions = computed(() => [
    { label: this.transloco.translate('analysis.filters.allTopicStatuses'), value: '' },
    { label: this.transloco.translate('analysis.topicStatus.pending'), value: 'pending' },
    { label: this.transloco.translate('analysis.topicStatus.approved'), value: 'approved' },
  ])
  protected readonly trendMax = computed(() =>
    Math.max(1, ...this.analysis().trend.map((item) => item.count)),
  )
  protected readonly flaggedCount = computed(() =>
    this.analysis()
      .severities.filter((item) => item.severity === 'critical' || item.severity === 'blocking')
      .reduce((total, item) => total + item.count, 0),
  )
  protected readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.analysis().total / this.analysis().pageSize)),
  )

  constructor() {
    effect(() => {
      this.appIcons.loadIcons(this.apps())
    })
  }

  protected changeFilter(name: string, value: string): void {
    switch (name) {
      case 'appId':
        this.selectedAppId.set(value)
        this.selectedTopicId.set('')
        this.selectedVersion.set('')
        break
      case 'from':
        this.selectedFrom.set(value)
        break
      case 'to':
        this.selectedTo.set(value)
        break
      case 'provider':
        this.selectedProvider.set(value)
        this.selectedVersion.set('')
        break
      case 'version':
        this.selectedVersion.set(value)
        break
      case 'severity':
        this.selectedSeverity.set(value)
        break
      case 'intent':
        this.selectedIntent.set(value)
        break
      case 'topicId':
        this.selectedTopicId.set(value)
        break
      case 'topicStatus':
        this.selectedTopicStatus.set(value)
        break
      default:
        break
    }
    this.selectedPage.set(1)
    this.updateUrl()
  }

  protected resetFilters(): void {
    this.selectedPage.set(1)
    this.selectedFrom.set('')
    this.selectedTo.set('')
    this.selectedProvider.set('')
    this.selectedVersion.set('')
    this.selectedSeverity.set('')
    this.selectedIntent.set('')
    this.selectedTopicId.set('')
    this.selectedTopicStatus.set('')
    this.updateUrl()
  }

  protected setSeverity(severity: string): void {
    this.changeFilter('severity', this.selectedSeverity() === severity ? '' : severity)
  }

  protected setTopic(topicId: string): void {
    this.changeFilter('topicId', this.selectedTopicId() === topicId ? '' : topicId)
  }

  protected setTrendDay(date: string): void {
    this.selectedFrom.set(date)
    this.selectedTo.set(date)
    this.selectedPage.set(1)
    this.updateUrl()
  }

  protected setPage(page: number): void {
    this.selectedPage.set(page)
    this.updateUrl()
  }

  protected openClassification(review: AnalysisReview): void {
    const topics = this.analysis().topics.filter((topic) => topic.appId === review.appId)
    const dialog = this.dialogService.open(ReviewClassificationDialogComponent, {
      header: this.transloco.translate('analysis.editor.title'),
      modal: true,
      closable: true,
      dismissableMask: true,
      width: 'min(720px, 94vw)',
      data: { review, topics },
    })
    dialog?.onClose.subscribe((result?: ReviewClassificationDialogResult) => {
      if (!result) {
        return
      }
      this.pendingAction.set(review.id)
      const request =
        result.action === 'reset'
          ? this.analysisService.resetReviewClassification(review.id)
          : this.analysisService.updateReviewClassification(review.id, result)
      request.subscribe({
        next: () => {
          this.message.set({ type: 'success', key: 'analysis.messages.reviewSaved' })
          this.analysisResource.reload()
        },
        error: () => {
          this.message.set({ type: 'error', key: 'analysis.messages.actionFailed' })
          this.pendingAction.set(null)
        },
        complete: () => {
          this.pendingAction.set(null)
        },
      })
    })
  }

  private updateUrl(): void {
    const queryParams = {
      appId: queryValue(this.selectedAppId()),
      from: queryValue(this.selectedFrom()),
      to: queryValue(this.selectedTo()),
      provider: queryValue(this.selectedProvider()),
      version: queryValue(this.selectedVersion()),
      severity: queryValue(this.selectedSeverity()),
      intent: queryValue(this.selectedIntent()),
      topicId: queryValue(this.selectedTopicId()),
      topicStatus: queryValue(this.selectedTopicStatus()),
      page: this.selectedPage() === 1 ? null : String(this.selectedPage()),
    } satisfies Record<string, string | null>
    void this.router.navigate([], { relativeTo: this.route, queryParams, replaceUrl: true })
  }
}

function dateToIso(value: string, end: boolean): string | undefined {
  if (!value) {
    return undefined
  }
  return `${value}T${end ? '23:59:59.999' : '00:00:00.000'}Z`
}

function queryValue(value: string): string | null {
  return value || null
}

function parsePage(value: string | null): number {
  const page = Number(value ?? '1')
  return Number.isInteger(page) && page >= 1 ? page : 1
}
