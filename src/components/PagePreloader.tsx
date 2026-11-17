import { useEffect } from 'react'
import { useAuth } from '../features/auth/useAuth'
import { preloadPages } from '../lib/lazyPage'

/**
 * 앱이 뜬 뒤 쉬는 시간에 나머지 화면 코드를 미리 받아 화면 이동 때 "불러오는 중"이 생기지 않게 한다(lib/lazyPage).
 * 공개 화면은 바로, 일반회원·비로그인(곧 로그인할 사람)은 회원 화면, 관리자는 관리자 화면만 받는다.
 */
export function PagePreloader() {
  const { state } = useAuth()
  const kind = state.status === 'loading' ? null : state.status === 'authenticated' && state.me.role === 'MASTER' ? 'admin' : 'user'

  useEffect(() => {
    preloadPages('public')
  }, [])

  useEffect(() => {
    if (kind) {
      preloadPages(kind)
    }
  }, [kind])

  return null
}
