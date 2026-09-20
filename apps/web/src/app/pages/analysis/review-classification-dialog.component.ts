import { Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslocoDirective } from '@jsverse/transloco'
import {
  analysisReviewSchema,
  reviewTopicSchema,
  type ReportedSeverity,
} from '@reviewinbox/contracts'
import { ButtonModule } from 'primeng/button'
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog'
import { MultiSelectModule } from 'primeng/multiselect'
import { SelectModule } from 'primeng/select'
import { z } from 'zod'

import { type AnalysisIntent } from '../../shared/services/analysis.service'

export type ReviewClassificationDialogResult =
  | {
      action: 'save'
      severity: ReportedSeverity | null
      intents: AnalysisIntent[]
      topicIds: string[]
    }
  | { action: 'reset' }

const dialogDataSchema = z.object({
  review: analysisReviewSchema,
  topics: z.array(reviewTopicSchema),
})

export type ReviewClassificationDialogSave = {
  action: 'save'
  severity: ReportedSeverity | null
  intents: AnalysisIntent[]
  topicIds: string[]
}

@Component({
  selector: 'ri-review-classification-dialog',
  imports: [ButtonModule, FormsModule, MultiSelectModule, SelectModule, TranslocoDirective],
  templateUrl: './review-classification-dialog.component.html',
})
export class ReviewClassificationDialogComponent {
  private readonly config = inject(DynamicDialogConfig)
  private readonly ref = inject(DynamicDialogRef)
  private readonly data = dialogDataSchema.parse(this.config.data)
  protected readonly review = this.data.review
  protected readonly topics = this.data.topics.filter(
    (topic) => topic.status !== 'rejected' && topic.mergedIntoId === null,
  )
  protected readonly severities: ReportedSeverity[] = [
    'none',
    'minor',
    'degraded',
    'blocking',
    'critical',
  ]
  protected readonly intents: AnalysisIntent[] = [
    'report_problem',
    'request_feature',
    'request_help',
    'request_refund',
    'express_satisfaction',
    'express_dissatisfaction',
  ]
  protected severity = this.review.severity ?? null
  protected selectedIntents = [...this.review.intents]
  protected selectedTopicIds = this.review.topics.map((topic) => topic.id)

  protected save(): void {
    this.ref.close({
      action: 'save',
      severity: this.severity,
      intents: this.selectedIntents,
      topicIds: this.selectedTopicIds,
    } satisfies ReviewClassificationDialogSave)
  }

  protected reset(): void {
    this.ref.close({ action: 'reset' } satisfies ReviewClassificationDialogResult)
  }

  protected cancel(): void {
    this.ref.close()
  }
}
