import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { homePathFor } from '../features/auth/RequireRole'
import { useAuth } from '../features/auth/useAuth'
import { HISTORY_TABS } from './HistoryTabs'
import { Icon, type IconName } from './Icon'
import { RatesProvider } from './RatesProvider'
import { RateTicker } from './RateTicker'

const HISTORY_PATHS = new Set(HISTORY_TABS.map((tab) => tab.to))

/**
 * 모바일 하단 탭바(일반회원). "내역"은 거래내역 도메인 탭(충전·송금·환전·결제 내역)으로 가며 결제 내역에서 시작한다.
 * 내역 목록 화면에 있을 때는 "내역"만 선택 표시한다.
 */
const USER_TABS: { to: string; label: string; icon: IconName; isActive: (path: string) => boolean }[] = [
  { to: '/', label: '홈', icon: 'home', isActive: (path) => path === '/' },
  {
    to: '/wallet',
    label: '지갑·충전',
    icon: 'wallet',
    isActive: (path) => path.startsWith('/wallet') && !HISTORY_PATHS.has(path),
  },
  {
    to: '/transfers/new',
    label: '송금',
    icon: 'send',
    isActive: (path) => path.startsWith('/transfers') && !HISTORY_PATHS.has(path),
  },
  {
    to: '/exchange',
    label: '환전',
    icon: 'swap',
    isActive: (path) => path.startsWith('/exchange') && !HISTORY_PATHS.has(path),
  },
  { to: '/payments', label: '내역', icon: 'list', isActive: (path) => HISTORY_PATHS.has(path) },
]

type MenuItem = { to: string; label: string; icon: IconName }

const MASTER_MENU: MenuItem[] = [
  { to: '/admin/reviews', label: '처리 대기', icon: 'inbox' },
  { to: '/admin/transfers', label: '송금', icon: 'send' },
  { to: '/admin/charges', label: '충전', icon: 'plus' },
  { to: '/admin/payments', label: '결제', icon: 'card' },
  { to: '/admin/resolutions', label: '처리 기록', icon: 'history' },
  { to: '/admin/users', label: '회원', icon: 'users' },
  { to: '/admin/terms', label: '약관', icon: 'document' },
  { to: '/admin/merchants/new', label: '가맹점 생성', icon: 'store' },
]

const USER_MENU: MenuItem[] = [
  { to: '/wallet', label: '지갑', icon: 'wallet' },
  { to: '/transfers', label: '송금', icon: 'send' },
  { to: '/payments', label: '결제', icon: 'card' },
  { to: '/exchange', label: '환전', icon: 'swap' },
  { to: '/merchant', label: '가맹점', icon: 'store' },
]

const ANONYMOUS_MENU: MenuItem[] = [
  { to: '/exchange-rates', label: '환율', icon: 'chart' },
  { to: '/login', label: '로그인', icon: 'login' },
  { to: '/signup', label: '회원가입', icon: 'user' },
]

function MenuLinks({ items }: { items: MenuItem[] }) {
  return (
    <>
      {items.map((item) => (
        <NavLink key={item.to} to={item.to}>
          <Icon name={item.icon} />
          {item.label}
        </NavLink>
      ))}
    </>
  )
}

/** 계정 메뉴 항목(헤더 아바타 메뉴와 서랍 아래에 같은 항목). */
function AccountLinks({ isUser, loggingOut, onLogout }: { isUser: boolean; loggingOut: boolean; onLogout: () => void }) {
  return (
    <>
      {isUser && (
        <NavLink to="/me">
          <Icon name="user" />내 정보
        </NavLink>
      )}
      <NavLink to="/account/password">
        <Icon name="lock" />
        비밀번호 변경
      </NavLink>
      <button type="button" onClick={onLogout} disabled={loggingOut}>
        <Icon name="logout" />
        로그아웃
      </button>
    </>
  )
}

/**
 * 공통 레이아웃(docs/convention/style.md 5절). 1024px 이상은 네이비 가로 헤더(로고 · 메뉴 · 환율 티커 · 계정),
 * 그보다 좁으면 미니 헤더 + 메뉴 서랍, 768px 미만 일반회원은 하단 탭바. 메뉴 링크 텍스트·경로와
 * 일반회원·관리자·비로그인 분기는 그대로다.
 */
export function AppLayout() {
  const { state, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [loggingOut, setLoggingOut] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const accountRef = useRef<HTMLDivElement>(null)

  // 다른 화면으로 가면 서랍·계정 메뉴를 닫는다.
  useEffect(() => {
    setMenuOpen(false)
    setAccountOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!menuOpen && !accountOpen) {
      return
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        setAccountOpen(false)
      }
    }
    const onPointerDown = (event: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(event.target as Node)) {
        setAccountOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [menuOpen, accountOpen])

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await logout()
    } catch {
      // 로그아웃 요청이 실패해도 화면은 로그아웃 상태로 둔다(세션은 만료 시간에 끝난다).
    } finally {
      setLoggingOut(false)
      setAccountOpen(false)
      setMenuOpen(false)
      navigate('/', { replace: true })
    }
  }

  const authenticated = state.status === 'authenticated'
  const isMaster = authenticated && state.me.role === 'MASTER'
  const isUser = authenticated && !isMaster
  const homePath = authenticated ? homePathFor(state.me.role) : '/'
  const realName = state.status === 'authenticated' ? state.me.realName : ''

  const menu = (
    <>
      {isMaster && <MenuLinks items={MASTER_MENU} />}
      {isUser && <MenuLinks items={USER_MENU} />}
      {state.status === 'anonymous' && <MenuLinks items={ANONYMOUS_MENU} />}
    </>
  )

  return (
    <RatesProvider enabled={!isMaster && state.status !== 'loading'}>
      <div className={isUser ? 'app with-tabbar' : 'app'}>
        <header className="app-header">
          <div className="app-header-inner">
            <Link to={homePath} className="app-logo">
              <span className="app-logo-mark" aria-hidden="true">
                <Icon name="arrowUp" />
              </span>
              TravelPay
            </Link>
            <nav className="app-nav" aria-label="전체 메뉴">
              {menu}
            </nav>
            <div className="app-header-right">
              {!isMaster && <RateTicker />}
              {authenticated && (
                <div className="app-account" ref={accountRef}>
                  <button
                    type="button"
                    className="app-profile"
                    aria-expanded={accountOpen}
                    aria-controls="app-account-menu"
                    onClick={() => setAccountOpen((open) => !open)}
                  >
                    <span className="app-avatar" aria-hidden="true">
                      {realName.slice(0, 1)}
                    </span>
                    <span className="app-user-name">
                      {realName} 님{isMaster && <span className="app-user-role">(관리자)</span>}
                    </span>
                  </button>
                  {accountOpen && (
                    <nav className="app-account-menu" id="app-account-menu" aria-label="계정 메뉴">
                      <AccountLinks isUser={isUser} loggingOut={loggingOut} onLogout={handleLogout} />
                    </nav>
                  )}
                </div>
              )}
              <button
                type="button"
                className="app-menu-button"
                aria-expanded={menuOpen}
                aria-controls="app-drawer"
                onClick={() => setMenuOpen((open) => !open)}
              >
                <Icon name="menu" />
                메뉴
              </button>
            </div>
          </div>
        </header>

        {menuOpen && (
          <>
            <div className="app-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />
            <div className="app-drawer" id="app-drawer">
              <nav className="app-drawer-nav" aria-label="전체 메뉴">
                {menu}
              </nav>
              {authenticated && (
                <nav className="app-drawer-nav app-drawer-account" aria-label="계정 메뉴">
                  <AccountLinks isUser={isUser} loggingOut={loggingOut} onLogout={handleLogout} />
                </nav>
              )}
            </div>
          </>
        )}

        <main className="app-main">
          <Outlet />
        </main>

        {isUser && (
          <nav className="app-tabbar" aria-label="주요 메뉴">
            {USER_TABS.map((tab) => {
              const active = tab.isActive(pathname)
              return (
                <Link
                  key={tab.label}
                  to={tab.to}
                  className={active ? 'active' : undefined}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon name={tab.icon} />
                  {tab.label}
                </Link>
              )
            })}
          </nav>
        )}
      </div>
    </RatesProvider>
  )
}
