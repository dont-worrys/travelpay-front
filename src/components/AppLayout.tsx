import { useState } from 'react'
import { Link, Outlet, useNavigate } from 'react-router'
import { homePathFor } from '../features/auth/RequireRole'
import { useAuth } from '../features/auth/useAuth'

export function AppLayout() {
  const { state, logout } = useAuth()
  const navigate = useNavigate()
  const [loggingOut, setLoggingOut] = useState(false)

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await logout()
    } catch {
      // 로그아웃 요청이 실패해도 화면은 로그아웃 상태로 둔다(세션은 만료 시간에 끝난다).
    } finally {
      setLoggingOut(false)
      navigate('/', { replace: true })
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <Link to={state.status === 'authenticated' ? homePathFor(state.me.role) : '/'} className="app-title">
          TravelPay
        </Link>
        <nav className="app-nav">
          {state.status === 'authenticated' && state.me.role === 'MASTER' && (
            <>
              <Link to="/admin/reviews">처리 대기</Link>
              <Link to="/admin/transfers">송금</Link>
              <Link to="/admin/charges">충전</Link>
              <Link to="/admin/resolutions">처리 기록</Link>
              <Link to="/admin/merchants/new">가맹점 생성</Link>
              <span>{state.me.realName}님(관리자)</span>
              <Link to="/account/password">비밀번호 변경</Link>
              <button type="button" className="link-button" onClick={handleLogout} disabled={loggingOut}>
                로그아웃
              </button>
            </>
          )}
          {state.status === 'authenticated' && state.me.role !== 'MASTER' && (
            <>
              <Link to="/wallet">지갑</Link>
              <Link to="/transfers">송금</Link>
              <Link to="/payments">결제</Link>
              <Link to="/exchange">환전</Link>
              <Link to="/merchant">가맹점</Link>
              <Link to="/me">{state.me.realName}님</Link>
              <button type="button" className="link-button" onClick={handleLogout} disabled={loggingOut}>
                로그아웃
              </button>
            </>
          )}
          {state.status === 'anonymous' && (
            <>
              <Link to="/exchange-rates">환율</Link>
              <Link to="/login">로그인</Link>
              <Link to="/signup">회원가입</Link>
            </>
          )}
        </nav>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
