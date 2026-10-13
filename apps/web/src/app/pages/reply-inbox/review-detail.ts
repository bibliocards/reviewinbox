import { catchError, map, of, switchMap, type Observable } from 'rxjs'

export function loadReviewDetail<Review extends { id: string }, Classification>(
  reviews: Observable<Review | null>,
  loadClassification: (reviewId: string) => Observable<Classification>,
): Observable<{ review: Review; classification: Classification | null } | null> {
  return reviews.pipe(
    switchMap((review) =>
      review === null
        ? of(null)
        : loadClassification(review.id).pipe(
            catchError(() => of(null)),
            map((classification) => ({ review, classification })),
          ),
    ),
  )
}
