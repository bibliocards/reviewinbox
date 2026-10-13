import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core'
import { FormsModule } from '@angular/forms'
import { RouterLink } from '@angular/router'
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco'
import type { AnalysisResponse, ReportedSeverity, ReviewTopic } from '@reviewinbox/contracts'
import { ButtonModule } from 'primeng/button'
import { ProgressBarModule } from 'primeng/progressbar'
import { SelectButtonModule } from 'primeng/selectbutton'
import { TableModule } from 'primeng/table'

import { badgeClasses } from '../../shared/badge-classes'
import { TypedTemplateDirective } from '../../shared/directives/typed-template.directive'
import { buildAnalysisTrend, trendPeriodLabel, type TrendPeriod } from './analysis-trend'

@Component({
  selector: 'ri-analysis-overview',
  imports: [
    ButtonModule,
    FormsModule,
    ProgressBarModule,
    RouterLink,
    SelectButtonModule,
    TableModule,
    TranslocoDirective,
    TypedTemplateDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './analysis-overview.component.html',
})
export class AnalysisOverviewComponent {
  readonly analysis = input.required<AnalysisResponse>()
  readonly coverage = input.required<number>()
  readonly flaggedCount = input.required<number>()
  readonly selectedSeverity = input('')
  readonly selectedTopicId = input('')
  readonly severitySelected = output<string>()
  readonly topicSelected = output<string>()
  readonly trendSelected = output<TrendPeriod>()
  readonly from = input('')
  readonly to = input('')
  readonly selectedAppId = input('')
  protected readonly granularity = signal<'auto' | 'week' | 'month'>('auto')
  protected readonly granularityOptions = computed(() => [
    { label: this.transloco.translate('analysis.trend.auto'), value: 'auto' },
    { label: this.transloco.translate('analysis.trend.week'), value: 'week' },
    { label: this.transloco.translate('analysis.trend.month'), value: 'month' },
  ])
  protected readonly severityRows = computed(() =>
    (['critical', 'blocking', 'degraded', 'minor', 'none', 'unknown'] as const).map((severity) => ({
      severity,
      count: this.analysis().severities.find((item) => item.severity === severity)?.count ?? 0,
    })),
  )
  protected readonly maxSeverityCount = computed(() =>
    Math.max(1, ...this.severityRows().map((item) => item.count)),
  )
  protected readonly pendingTopicCount = computed(
    () => this.analysis().topics.filter((topic) => topic.status === 'pending').length,
  )
  protected readonly badgeClasses = badgeClasses
  protected readonly coverageProgressTokens = {
    root: { height: '4px', background: 'var(--color-surface-3)' },
    value: { background: 'var(--color-ink-muted)' },
  }
  private readonly transloco = inject(TranslocoService)
  protected readonly trend = computed(() => {
    const mode = this.granularity()
    return buildAnalysisTrend(
      this.analysis().trend,
      this.from(),
      this.to(),
      mode === 'auto' ? undefined : mode,
    )
  })

  protected axisLabel(date: string): string {
    const options: Intl.DateTimeFormatOptions = { timeZone: 'UTC' }
    switch (this.trend().granularity) {
      case 'year':
        options.year = 'numeric'
        break
      case 'month':
        options.month = 'short'
        options.year = '2-digit'
        break
      case 'day':
      case 'week':
        options.day = 'numeric'
        options.month = 'short'
    }
    return new Intl.DateTimeFormat(this.transloco.getActiveLang(), options).format(
      new Date(`${date}T00:00:00Z`),
    )
  }

  protected showLabel(index: number): boolean {
    const length = this.trend().buckets.length
    return index % Math.ceil(length / 6) === 0 && (length <= 2 || index < length - 2)
  }

  protected periodLabel(period: TrendPeriod): string {
    return trendPeriodLabel(period, this.transloco.getActiveLang())
  }

  protected severityClass(value: ReportedSeverity | 'unknown'): string {
    return badgeClasses(value, 'indicator')
  }
  protected isPending(topic: ReviewTopic): boolean {
    return topic.status === 'pending'
  }
}
