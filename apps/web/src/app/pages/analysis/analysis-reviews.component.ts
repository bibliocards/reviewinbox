import { NgClass } from '@angular/common'
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core'
import { RouterLink } from '@angular/router'
import { TranslocoDirective } from '@jsverse/transloco'
import type { AnalysisReview } from '@reviewinbox/contracts'
import { ButtonModule } from 'primeng/button'

@Component({
  selector: 'ri-analysis-reviews',
  imports: [ButtonModule, NgClass, RouterLink, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './analysis-reviews.component.html',
})
export class AnalysisReviewsComponent {
  readonly reviews = input.required<readonly AnalysisReview[]>()
  readonly total = input.required<number>()
  readonly page = input.required<number>()
  readonly pageCount = input.required<number>()
  readonly loading = input(false)
  readonly pendingReviewId = input<string | null>(null)
  readonly corrected = output<AnalysisReview>()
  readonly severitySelected = output<string>()
  readonly intentSelected = output<string>()
  readonly topicSelected = output<string>()
  readonly pageSelected = output<number>()
  protected providerLabel(provider: string): string {
    return provider === 'apple_app_store' ? 'Apple App Store' : 'Google Play'
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
}
