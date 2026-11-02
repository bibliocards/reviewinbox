import { Location } from '@angular/common'
import { DOCUMENT, Injectable, computed, inject, linkedSignal, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { ActivatedRoute, Router } from '@angular/router'
import { replyInboxFilterSchema } from '@reviewinbox/contracts'
import { z } from 'zod'

type ReplyInboxFilter = z.infer<typeof replyInboxFilterSchema>

@Injectable()
export class ReviewNavigationService {
  private readonly route = inject(ActivatedRoute)
  private readonly router = inject(Router)
  private readonly location = inject(Location)
  private readonly document = inject(DOCUMENT)
  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  })
  readonly selectedReviewId = computed(() => this.queryParams().get('reviewId') ?? undefined)
  private readonly fragment = toSignal(this.route.fragment, {
    initialValue: this.route.snapshot.fragment,
  })
  // Keep filtered-list selection separate from the unfiltered reviewId deep link.
  readonly detailReviewId = computed(() => {
    const fragment = this.fragment()
    return fragment?.startsWith('review/') === true
      ? (z.uuid().safeParse(fragment.slice('review/'.length)).data ?? null)
      : null
  })
  readonly mobileDetailOpen = computed(
    () => this.detailReviewId() !== null || this.selectedReviewId() !== undefined,
  )
  private listPosition: { x: number; y: number; target: Pick<HTMLElement, 'focus'> } | null = null
  private openedFromList = false
  readonly selectedAppId = linkedSignal(
    () => z.uuid().safeParse(this.queryParams().get('appId')).data ?? '',
  )
  readonly selectedFilter = linkedSignal<ReplyInboxFilter>(
    () => replyInboxFilterSchema.safeParse(this.queryParams().get('filter')).data ?? 'actionable',
  )
  readonly focusedReviewId = signal<string | null>(null)

  selectFilter(value: string | number | undefined): void {
    const parsed = replyInboxFilterSchema.safeParse(value)
    if (parsed.success) {
      this.selectedFilter.set(parsed.data)
      this.focusedReviewId.set(null)
      this.updateFilterUrl()
    }
  }

  selectApp(appId: string): void {
    this.selectedAppId.set(appId)
    this.focusedReviewId.set(null)
    this.updateFilterUrl()
  }

  private updateFilterUrl(): void {
    this.listPosition = null
    this.openedFromList = false
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { filter: this.selectedFilter(), appId: this.selectedAppId() || null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    })
  }

  openReview(reviewId: string, target: Pick<HTMLElement, 'focus'>): void {
    this.focusedReviewId.set(reviewId)
    if (this.isMobile()) {
      const window = this.document.defaultView
      this.listPosition = { x: window?.scrollX ?? 0, y: window?.scrollY ?? 0, target }
      this.openedFromList = true
      this.showReview(reviewId, false)
    } else if (this.detailReviewId() !== null) {
      this.showReview(reviewId, true)
    }
  }

  showReview(reviewId: string, replaceUrl: boolean): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParamsHandling: 'preserve',
      fragment: `review/${reviewId}`,
      replaceUrl,
    })
  }

  backToList(): void {
    if (this.openedFromList) {
      this.location.back()
    } else {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { reviewId: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      })
    }
  }

  isMobile(): boolean {
    return this.document.defaultView?.matchMedia('(max-width: 900px)').matches ?? false
  }

  restoreView(target?: Pick<HTMLElement, 'focus' | 'scrollIntoView'>): void {
    if (!this.isMobile()) {
      return
    }
    if (this.mobileDetailOpen()) {
      target?.focus({ preventScroll: true })
      target?.scrollIntoView({ block: 'start', behavior: 'instant' })
    } else if (this.listPosition) {
      const { x, y, target: reviewButton } = this.listPosition
      reviewButton.focus({ preventScroll: true })
      this.document.defaultView?.scrollTo({ left: x, top: y, behavior: 'instant' })
    }
  }

  resetForOrganization(): void {
    this.listPosition = null
    this.openedFromList = false
    this.selectedAppId.set('')
    this.focusedReviewId.set(null)
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { appId: null, reviewId: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    })
  }
}
