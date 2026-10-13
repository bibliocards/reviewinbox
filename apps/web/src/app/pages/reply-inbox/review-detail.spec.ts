import { Subject, type Observable } from 'rxjs'
import { describe, expect, it, vi } from 'vitest'

import { loadReviewDetail } from './review-detail'

describe('Reply Inbox detail rendering', () => {
  it('keeps the previous detail until the next Review and classification are ready together', () => {
    const reviews = new Subject<{ id: string; body: string } | null>()
    const firstAnalysis = new Subject<{ severity: string }>()
    const nextAnalysis = new Subject<{ severity: string }>()
    const emissions: unknown[] = []
    const loadClassification = vi
      .fn<(id: string) => Observable<{ severity: string }>>(() => firstAnalysis)
      .mockReturnValueOnce(firstAnalysis)
      .mockReturnValueOnce(nextAnalysis)
    loadReviewDetail(reviews, loadClassification).subscribe((detail) => {
      emissions.push(detail)
    })

    reviews.next({ id: 'first', body: 'First Review' })
    firstAnalysis.next({ severity: 'blocking' })
    reviews.next({ id: 'next', body: 'Next Review' })
    expect(emissions).toHaveLength(1)
    expect(loadClassification).toHaveBeenNthCalledWith(2, 'next')
    nextAnalysis.next({ severity: 'minor' })
    expect(emissions).toEqual([
      { review: { id: 'first', body: 'First Review' }, classification: { severity: 'blocking' } },
      { review: { id: 'next', body: 'Next Review' }, classification: { severity: 'minor' } },
    ])
  })

  it('discards late results and clears the detail when the Organization or Inbox is cleared', () => {
    const reviews = new Subject<{ id: string } | null>()
    const firstAnalysis = new Subject<string>()
    const nextAnalysis = new Subject<string>()
    const emissions: unknown[] = []
    const loadClassification = vi
      .fn<(id: string) => Observable<string>>(() => firstAnalysis)
      .mockReturnValueOnce(firstAnalysis)
      .mockReturnValueOnce(nextAnalysis)
    loadReviewDetail(reviews, loadClassification).subscribe((detail) => {
      emissions.push(detail)
    })

    reviews.next({ id: 'first' })
    reviews.next({ id: 'next' })
    firstAnalysis.next('blocking')
    expect(emissions).toEqual([])
    nextAnalysis.next('minor')
    reviews.next(null)
    nextAnalysis.next('critical')
    expect(emissions).toEqual([{ review: { id: 'next' }, classification: 'minor' }, null])
  })

  it('still displays the Review when classification cannot be loaded', () => {
    const reviews = new Subject<{ id: string } | null>()
    const analysis = new Subject<string>()
    const emissions: unknown[] = []
    loadReviewDetail(reviews, () => analysis).subscribe((detail) => {
      emissions.push(detail)
    })

    reviews.next({ id: 'first' })
    analysis.error(new Error('Unavailable'))
    expect(emissions).toEqual([{ review: { id: 'first' }, classification: null }])
  })
})
