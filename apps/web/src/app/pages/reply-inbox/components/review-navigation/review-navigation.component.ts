import { NgClass } from '@angular/common'
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  viewChild,
} from '@angular/core'
import { TranslocoDirective } from '@jsverse/transloco'
import type { ReplyInboxReview } from '@reviewinbox/contracts'
import { ButtonModule } from 'primeng/button'

import { ReviewNavigationService } from './review-navigation.service'

@Component({
  selector: 'ri-review-navigation',
  imports: [ButtonModule, NgClass, TranslocoDirective],
  templateUrl: './review-navigation.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  host: { class: 'block min-[901px]:hidden', '[class.hidden]': '!navigation.mobileDetailOpen()' },
})
export class ReviewNavigationComponent {
  protected readonly navigation = inject(ReviewNavigationService)
  private readonly injector = inject(Injector)
  private readonly detailNavigation = viewChild<ElementRef<HTMLElement>>('detailNavigation')
  readonly reviews = input.required<ReplyInboxReview[]>()
  readonly selectedId = input<string | null>(null)
  readonly disabled = input(false)
  protected readonly reviewIndex = computed(() =>
    this.reviews().findIndex((review) => review.id === this.selectedId()),
  )
  protected readonly previousReview = computed(() => this.reviews()[this.reviewIndex() - 1])
  protected readonly nextReview = computed(() =>
    this.reviewIndex() < 0 ? undefined : this.reviews()[this.reviewIndex() + 1],
  )

  constructor() {
    effect(() => {
      this.navigation.mobileDetailOpen()
      this.navigation.detailReviewId()
      afterNextRender(
        () => {
          this.navigation.restoreView(this.detailNavigation()?.nativeElement)
        },
        { injector: this.injector },
      )
    })
  }

  protected showAdjacentReview(review: ReplyInboxReview | undefined): void {
    if (review && !this.disabled()) {
      this.navigation.focusedReviewId.set(review.id)
      this.navigation.showReview(review.id, true)
    }
  }
}
