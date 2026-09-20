import { ChangeDetectionStrategy, Component, input, output } from '@angular/core'
import { TranslocoDirective } from '@jsverse/transloco'
import type { AnalysisResponse, ReviewTopic } from '@reviewinbox/contracts'

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
  readonly trendSelected = output<string>()
  readonly trendMax = input.required<number>()

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
  protected barWidth(count: number): string {
    return `${Math.max(4, Math.round((count / this.trendMax()) * 100))}%`
  }
  protected isPending(topic: ReviewTopic): boolean {
    return topic.status === 'pending'
  }
}
