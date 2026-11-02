import { NgClass, NgTemplateOutlet } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  HostListener,
  inject,
  linkedSignal,
} from '@angular/core'
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop'
import { RouterLink } from '@angular/router'
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco'
import type { ReplyInboxReview } from '@reviewinbox/contracts'
import { ButtonModule } from 'primeng/button'
import { TabsModule } from 'primeng/tabs'

import {
  AppSelectComponent,
  type AppSelectOption,
} from '../../shared/components/app-select/app-select.component'
import { AnalysisService } from '../../shared/services/analysis.service'
import { AppIconsService } from '../../shared/services/app-icons.service'
import { AppsService } from '../../shared/services/apps.service'
import { ReplyInboxService } from '../../shared/services/reply-inbox.service'
import { ReviewDetailComponent } from './components/review-detail/review-detail.component'
import { ReviewListComponent } from './components/review-list/review-list.component'
import { ReviewNavigationComponent } from './components/review-navigation/review-navigation.component'
import { ReviewNavigationService } from './components/review-navigation/review-navigation.service'
import { ReviewActionsService } from './review-actions.service'
import { loadReviewDetail } from './review-detail'

type ReplyInboxFilter = 'actionable' | ReplyInboxReview['replyStatus']
const filterValues: readonly ReplyInboxFilter[] = [
  'actionable',
  'drafted',
  'published',
  'ignored',
  'failed',
  'pending',
]

@Component({
  selector: 'ri-reply-inbox-page',
  providers: [ReviewNavigationService, ReviewActionsService],
  imports: [
    RouterLink,
    AppSelectComponent,
    ButtonModule,
    TabsModule,
    NgTemplateOutlet,
    TranslocoDirective,
    NgClass,
    ReviewNavigationComponent,
    ReviewListComponent,
    ReviewDetailComponent,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './reply-inbox.page.html',
})
export class ReplyInboxPageComponent {
  protected readonly navigation = inject(ReviewNavigationService)
  protected readonly actions = inject(ReviewActionsService)
  protected readonly selectedReviewId = this.navigation.selectedReviewId
  protected readonly mobileDetailOpen = this.navigation.mobileDetailOpen
  protected readonly selectedAppId = this.navigation.selectedAppId
  protected readonly selectedFilter = this.navigation.selectedFilter
  private readonly appsService = inject(AppsService)
  private readonly replyInboxService = inject(ReplyInboxService)
  private readonly analysisService = inject(AnalysisService)
  private readonly transloco = inject(TranslocoService)
  private readonly appIcons = inject(AppIconsService)
  protected readonly appsResource = this.appsService.appsResource()
  protected readonly apps = computed(() =>
    this.appsResource.hasValue() ? this.appsResource.value().apps : [],
  )
  protected readonly appOptions = computed<AppSelectOption[]>(() => [
    { label: this.transloco.translate('replyInbox.filters.allApps'), value: '' },
    ...this.apps().map((app) => ({
      label: app.name,
      value: app.id,
      imageUrl: this.appIcons.iconUrl(app.id),
    })),
  ])
  protected readonly filterOptions = computed<AppSelectOption[]>(() =>
    filterValues.map((filter) => ({
      label: this.transloco.translate(this.filterLabelKey(filter)),
      value: filter,
    })),
  )
  protected readonly inboxResource = this.replyInboxService.replyInboxResource(() => ({
    filter: this.selectedFilter(),
    appId: this.selectedReviewId() === undefined ? this.selectedAppId() : undefined,
    reviewId: this.selectedReviewId(),
  }))
  // Preserve the current Inbox during reloads; the template disables its interactions.
  protected readonly reviews = linkedSignal<
    { loading: boolean; reviews: ReplyInboxReview[] },
    ReplyInboxReview[]
  >({
    source: () => ({
      loading: this.inboxResource.isLoading(),
      reviews: this.inboxResource.hasValue() ? this.inboxResource.value().reviews : [],
    }),
    computation: (current, previous) =>
      current.loading ? (previous?.value ?? []) : current.reviews,
  })

  protected readonly focusedReview = computed(() => {
    const detailId = this.navigation.detailReviewId()
    if (detailId !== null) {
      return this.reviews().find((review) => review.id === detailId) ?? null
    }
    return (
      this.reviews().find((review) => review.id === this.navigation.focusedReviewId())
      ?? this.reviews()[0]
      ?? null
    )
  })
  private readonly reviewDetail = toSignal(
    loadReviewDetail(toObservable(this.focusedReview), (reviewId) =>
      this.analysisService.reviewAnalysis(reviewId),
    ),
    { initialValue: null },
  )
  protected readonly displayedReview = computed(() => {
    const review = this.reviewDetail()?.review
    return this.reviews().some((item) => item.id === review?.id) ? (review ?? null) : null
  })
  protected readonly classification = computed(() => this.reviewDetail()?.classification ?? null)
  protected readonly detailLoading = computed(() => this.focusedReview() !== this.displayedReview())

  constructor() {
    effect(() => {
      this.appIcons.loadIcons(this.apps())
    })
    this.actions.changes$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.reload()
    })
  }

  protected reload(): void {
    this.inboxResource.reload()
  }

  @HostListener('window:reviewinbox:active-organization-changed')
  protected reloadForActiveOrganization(): void {
    this.navigation.resetForOrganization()
    this.actions.resetForOrganization()
    this.reviews.set([])
    this.appsResource.reload()
    this.inboxResource.reload()
  }

  private filterLabelKey(filter: ReplyInboxFilter): string {
    return filter === 'actionable' ? 'replyInbox.filters.actionable' : `replyInbox.status.${filter}`
  }
}
