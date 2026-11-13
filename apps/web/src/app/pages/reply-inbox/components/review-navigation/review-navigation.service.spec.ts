// oxlint-disable-next-line import/no-unassigned-import -- Angular providers need the JIT compiler in Node tests.
import '@angular/compiler'
import { Location } from '@angular/common'
import { DOCUMENT, Injector } from '@angular/core'
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router'
import { BehaviorSubject } from 'rxjs'
import { expect, it, vi } from 'vitest'

import { ReviewNavigationService } from './review-navigation.service'

const appId = '11111111-1111-4111-8111-111111111111'
const firstId = '22222222-2222-4222-8222-222222222222'
const secondId = '33333333-3333-4333-8333-333333333333'

function navigationSession(
  options: { mobile?: boolean; reviewId?: string; fragment?: string } = {},
) {
  const params = convertToParamMap({
    filter: 'published',
    appId,
    reviewId: options.reviewId ?? null,
  })
  const queryParamMap = new BehaviorSubject(params)
  const fragment = new BehaviorSubject<string | null>(options.fragment ?? null)
  const route = {
    queryParamMap,
    fragment,
    snapshot: { queryParamMap: params, fragment: fragment.value },
  }
  const router = { navigate: vi.fn<Router['navigate']>().mockResolvedValue(true) }
  const location = { back: vi.fn<Location['back']>() }
  const viewport = {
    matchMedia: () => ({ matches: options.mobile ?? true }),
    scrollX: 0,
    scrollY: 780,
    scrollTo: vi.fn<(options: ScrollToOptions) => void>(),
  }
  const injector = Injector.create({
    providers: [
      ReviewNavigationService,
      { provide: ActivatedRoute, useValue: route },
      { provide: Router, useValue: router },
      { provide: Location, useValue: location },
      { provide: DOCUMENT, useValue: { defaultView: viewport } },
    ],
  })
  return {
    navigation: injector.get(ReviewNavigationService),
    route,
    router,
    location,
    viewport,
    injector,
  }
}

it('restores filters, scroll and focus when returning to the Review list', () => {
  const session = navigationSession()
  const trigger = { focus: vi.fn<HTMLElement['focus']>() }
  const detail = {
    focus: vi.fn<HTMLElement['focus']>(),
    scrollIntoView: vi.fn<HTMLElement['scrollIntoView']>(),
  }
  const { navigation, router, route, location, viewport } = session

  navigation.openReview(firstId, trigger)
  expect(router.navigate).toHaveBeenLastCalledWith(
    [],
    expect.objectContaining({
      fragment: `review/${firstId}`,
      queryParamsHandling: 'preserve',
      replaceUrl: false,
    }),
  )
  route.fragment.next(`review/${firstId}`)
  navigation.restoreView(detail)
  expect(detail.focus).toHaveBeenCalledWith({ preventScroll: true })
  expect(detail.scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'instant' })

  navigation.backToList()
  expect(location.back).toHaveBeenCalledOnce()
  route.fragment.next(null)
  navigation.restoreView()
  expect(navigation.mobileDetailOpen()).toBe(false)
  expect(navigation.selectedFilter()).toBe('published')
  expect(navigation.selectedAppId()).toBe(appId)
  expect(viewport.scrollTo).toHaveBeenCalledWith({ left: 0, top: 780, behavior: 'instant' })
  expect(trigger.focus).toHaveBeenCalledWith({ preventScroll: true })
  session.injector.destroy()
})

it('keeps desktop selection in the split view without adding browser history', () => {
  const session = navigationSession({ mobile: false })
  const trigger = { focus: vi.fn<HTMLElement['focus']>() }
  session.navigation.openReview(secondId, trigger)
  session.navigation.restoreView()
  expect(session.navigation.focusedReviewId()).toBe(secondId)
  expect(session.navigation.mobileDetailOpen()).toBe(false)
  expect(session.router.navigate).not.toHaveBeenCalled()
  expect(session.viewport.scrollTo).not.toHaveBeenCalled()
  session.injector.destroy()
})

it('shows all Apps without losing the selected status when an App-filtered view is empty', () => {
  const session = navigationSession()
  session.navigation.focusedReviewId.set(firstId)

  session.navigation.selectApp('')

  expect(session.navigation.selectedAppId()).toBe('')
  expect(session.navigation.selectedFilter()).toBe('published')
  expect(session.navigation.focusedReviewId()).toBeNull()
  expect(session.router.navigate).toHaveBeenLastCalledWith(
    [],
    expect.objectContaining({
      queryParams: { filter: 'published', appId: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    }),
  )
  session.injector.destroy()
})

it.each([{ reviewId: firstId }, { fragment: `review/${firstId}` }])(
  'returns a directly opened Review to the Inbox instead of leaving the app: %o',
  (options) => {
    const session = navigationSession(options)
    expect(session.navigation.mobileDetailOpen()).toBe(true)
    session.navigation.backToList()
    expect(session.location.back).not.toHaveBeenCalled()
    expect(session.router.navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        queryParams: { reviewId: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      }),
    )
    session.injector.destroy()
  },
)

it('clears the previous Organization selection and does not restore its list focus', () => {
  const session = navigationSession()
  const trigger = { focus: vi.fn<HTMLElement['focus']>() }
  session.navigation.openReview(firstId, trigger)
  session.route.fragment.next(`review/${firstId}`)
  session.navigation.resetForOrganization()
  session.route.fragment.next(null)
  session.navigation.restoreView()
  expect(session.navigation.selectedAppId()).toBe('')
  expect(session.navigation.focusedReviewId()).toBeNull()
  expect(session.router.navigate).toHaveBeenLastCalledWith(
    [],
    expect.objectContaining({ queryParams: { appId: null, reviewId: null }, replaceUrl: true }),
  )
  expect(trigger.focus).not.toHaveBeenCalled()
  expect(session.viewport.scrollTo).not.toHaveBeenCalled()
  session.injector.destroy()
})

it('browses adjacent Reviews in one history entry without changing the filtered list', () => {
  const session = navigationSession()
  const trigger = { focus: vi.fn<HTMLElement['focus']>() }
  const { navigation, router, route, location } = session
  navigation.openReview(firstId, trigger)
  route.fragment.next(`review/${firstId}`)
  navigation.showReview(secondId, true)
  expect(router.navigate).toHaveBeenLastCalledWith(
    [],
    expect.objectContaining({ fragment: `review/${secondId}`, replaceUrl: true }),
  )
  route.fragment.next(`review/${secondId}`)
  expect(navigation.detailReviewId()).toBe(secondId)
  expect(navigation.selectedReviewId()).toBeUndefined()

  navigation.backToList()
  expect(location.back).toHaveBeenCalledOnce()
  expect(navigation.selectedFilter()).toBe('published')
  expect(navigation.selectedAppId()).toBe(appId)
  session.injector.destroy()
})
