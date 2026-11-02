import { NgClass } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslocoDirective } from '@jsverse/transloco'
import type { AnalysisReview, ReplyInboxReview } from '@reviewinbox/contracts'
import { ButtonModule } from 'primeng/button'
import { TextareaModule } from 'primeng/textarea'

import { badgeClasses } from '../../../../shared/badge-classes'
import { AppIconsService } from '../../../../shared/services/app-icons.service'
import { ReviewActionsService } from '../../review-actions.service'
import { ReviewPresentationService } from '../review-presentation.service'

@Component({
  selector: 'ri-review-detail',
  imports: [NgClass, FormsModule, TranslocoDirective, ButtonModule, TextareaModule],
  templateUrl: './review-detail.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  host: { class: 'block min-w-0' },
})
export class ReviewDetailComponent {
  readonly selectedReview = input.required<ReplyInboxReview>()
  readonly classification = input<AnalysisReview | null>(null)
  readonly loading = input(false)
  protected readonly actions = inject(ReviewActionsService)
  protected readonly presentation = inject(ReviewPresentationService)
  protected readonly statusClass = badgeClasses
  private readonly appIcons = inject(AppIconsService)

  protected appIconUrl(appId: string): string | null {
    return this.appIcons.iconUrl(appId)
  }
}
