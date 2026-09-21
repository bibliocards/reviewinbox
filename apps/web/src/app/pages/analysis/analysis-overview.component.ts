import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core'
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco'
import type { AnalysisResponse, ReviewTopic } from '@reviewinbox/contracts'

import { buildAnalysisTrend, trendPeriodLabel, type TrendPeriod } from './analysis-trend'

@Component({
  selector: 'ri-analysis-overview',
  imports: [TranslocoDirective],
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
  private readonly transloco = inject(TranslocoService)
  protected readonly trend = computed(() =>
    buildAnalysisTrend(this.analysis().trend, this.from(), this.to()),
  )

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

  protected severityClass(value: string): string {
    switch (value) {
      case 'unknown':
        return 'bg-violet-400'
      case 'minor':
        return 'bg-yellow-500'
      case 'degraded':
        return 'bg-orange-500'
      case 'blocking':
        return 'bg-red-500'
      case 'critical':
        return 'bg-red-800'
      default:
        return 'bg-slate-400'
    }
  }
  protected isPending(topic: ReviewTopic): boolean {
    return topic.status === 'pending'
  }
}
