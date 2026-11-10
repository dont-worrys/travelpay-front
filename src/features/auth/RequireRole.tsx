import { Navigate, Outlet } from 'react-router'
import type { UserRole } from './api'
import { useAuth } from './useAuth'

/** 역할별 첫 화면. 관리자는 일반회원 화면을 쓰지 않는다. */
export function homePathFor(role: UserRole): string {
  return role === 'MASTER' ? '/admin' : '/'
}

/**
 * 지정한 역할만 하위 경로를 볼 수 있게 한다. `RequireAuth` 아래에 둔다.
 * 다른 역할이면 그 역할의 첫 화면으로 보낸다(관리자 → `/admin`, 일반회원 → `/`).
 */
export function RequireRole({ role }: { role: UserRole }) {
  const { state } = useAuth()
  if (state.status !== 'authenticated') {
    return null
  }
  if (state.me.role !== role) {
    return <Navigate to={homePathFor(state.me.role)} replace />
  }
  return <Outlet />
}
