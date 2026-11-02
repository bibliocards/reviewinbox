import { Injectable, inject } from '@angular/core'
import { TranslocoService } from '@jsverse/transloco'
import type { ReplyInboxReview } from '@reviewinbox/contracts'
import { formatDistanceToNow } from 'date-fns/formatDistanceToNow'
import { enUS, fr } from 'date-fns/locale'

@Injectable({ providedIn: 'root' })
export class ReviewPresentationService {
  private readonly transloco = inject(TranslocoService)
  reviewedAgo(review: ReplyInboxReview): string {
    const activeLang = this.transloco.getActiveLang()
    const distance = formatDistanceToNow(review.reviewedAt, {
      locale: activeLang === 'fr' ? fr : enUS,
    })
    return this.transloco.translate('replyInbox.reviewedAgo', { distance })
  }

  isFromAppStore(review: ReplyInboxReview): boolean {
    return review.provider === 'apple_app_store'
  }

  providerLabel(review: ReplyInboxReview): string {
    return this.transloco.translate(
      this.isFromAppStore(review) ? 'apps.stores.apple' : 'apps.stores.google',
    )
  }

  reviewTitle(title: string | null): string {
    return title === null || title === ''
      ? this.transloco.translate('replyInbox.untitledReview')
      : title
  }

  ratingLabel(rating: number): string {
    return this.transloco.translate('replyInbox.rating', { rating })
  }
}
