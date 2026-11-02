import { NgClass } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core'
import { TranslocoDirective } from '@jsverse/transloco'
import type { AnalysisReview, ReplyInboxReview } from '@reviewinbox/contracts'

import { badgeClasses } from '../../../../shared/badge-classes'
import { ReviewNavigationService } from '../review-navigation/review-navigation.service'
import { ReviewPresentationService } from '../review-presentation.service'

@Component({
  selector: 'ri-review-list',
  imports: [NgClass, TranslocoDirective],
  templateUrl: './review-list.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  host: { class: 'block min-w-0' },
})
export class ReviewListComponent {
  readonly reviews = input.required<ReplyInboxReview[]>()
  readonly selectedId = input<string | null>(null)
  readonly classification = input<AnalysisReview | null>(null)
  protected readonly navigation = inject(ReviewNavigationService)
  protected readonly presentation = inject(ReviewPresentationService)
  protected readonly statusClass = badgeClasses
}
