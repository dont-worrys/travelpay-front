import type { createBrowserRouter, RouterNavigateOptions, To } from 'react-router'

type DataRouter = ReturnType<typeof createBrowserRouter>

/** 경로는 그대로 두고 검색어·해시만 바꾸는 이동(목록 필터·페이지 이동의 `setSearchParams` 등). */
function keepsPath(to: To | null): boolean {
  if (to === null) {
    return true
  }
  if (typeof to === 'string') {
    return to.startsWith('?') || to.startsWith('#')
  }
  return to.pathname === undefined
}

/**
 * 다른 화면으로 옮길 때 이전 화면이 사라지며 새 화면과 겹쳐 바뀌도록 View Transitions를 기본으로 켠다.
 * react-router 7의 데이터 라우터에서는 Link·NavLink·useNavigate가 모두 `router.navigate`를 거치므로,
 * 링크마다 `viewTransition`을 붙이지 않고 이 한 곳에서 기본값을 정한다. 개별 이동이 값을 주면 그 값을 따른다.
 *
 * 기본으로 켜지 않는 이동:
 * - `replace` 이동: 로그인·권한 리다이렉트(`<Navigate replace>`)와 처리 후 상세로 바꾸는 이동. 링크 이동 중에
 *   리다이렉트가 겹치면 전환이 두 번 연달아 일어나 빈 화면이 잠깐 보인다.
 * - 검색어·해시만 바꾸는 이동: 목록 필터·페이지를 바꿀 때 화면 전체가 깜빡이지 않게 한다.
 * - `canTransition()`이 false일 때: 아직 받지 않은 화면 코드를 기다리는 동안 전환이 그리기를 멈추게 하지 않는다.
 * 뒤로·앞으로(POP)는 라우터가 앞서 전환한 경로 쌍을 되감아 다시 재생하는데, 브라우저의 스크롤 복원·모바일 스와이프
 * 모션과 겹치므로 구독자에게 넘기기 전에 전환 정보를 지워 바로 바뀌게 한다.
 * `startViewTransition`이 없는 브라우저에서는 라우터를 그대로 돌려줘 이전과 같고 라우터 경고도 나지 않는다.
 */
export function withDefaultViewTransition<R extends DataRouter>(
  router: R,
  canTransition: () => boolean,
  doc: Document = document,
): R {
  if (typeof doc.startViewTransition !== 'function') {
    return router
  }
  const navigate = router.navigate
  router.navigate = ((to: number | To | null, opts?: RouterNavigateOptions) => {
    if (typeof to === 'number') {
      return navigate(to)
    }
    const viewTransition = opts?.viewTransition ?? (!opts?.replace && !keepsPath(to) && canTransition())
    return navigate(to, { ...opts, viewTransition })
  }) as R['navigate']
  const subscribe = router.subscribe
  router.subscribe = (subscriber) =>
    subscribe((state, opts) =>
      subscriber(state, state.historyAction === 'POP' ? { ...opts, viewTransitionOpts: undefined } : opts),
    )
  return router
}
