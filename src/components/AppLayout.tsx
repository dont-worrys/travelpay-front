import { useEffect, useState } from 'react'
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

/** 상단 바의 위치 표시(첫 경로 기준). */
const SECTION_LABEL: [RegExp, string][] = [
  [/^\/admin/, '관리자'],
  [/^\/wallet/, '지갑'],
  [/^\/transfers/, '송금'],
  [/^\/payments/, '결제'],
  [/^\/exchange/, '환전'],
  [/^\/merchant/, '가맹점'],
  [/^\/me$/, '내 정보'],
  [/^\/account/, '계정'],
  [/^\/login/, '로그인'],
  [/^\/signup/, '회원가입'],
]

function sectionLabel(path: string): string | null {
  return SECTION_LABEL.find(([pattern]) => pattern.test(path))?.[1] ?? null
}

/**
 * 공통 레이아웃. 데스크톱(768px 이상)은 왼쪽 고정 사이드바 + 본문 위 상단 바(위치·사용자),
 * 모바일은 상단 미니 헤더(로고·사용자·메뉴 버튼) + 일반회원 하단 탭바. 메뉴 링크 텍스트·경로와
 * 일반회원·관리자·비로그인 분기는 그대로이고, 모바일에서는 메뉴 버튼으로 같은 메뉴를 펼친다.
 */
export function AppLayout() {
  const { state, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [loggingOut, setLoggingOut] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  // 다른 화면으로 가면 모바일 메뉴를 닫는다.
  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!menuOpen) {
      return
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

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

  const authenticated = state.status === 'authenticated'
  const isMaster = authenticated && state.me.role === 'MASTER'
  const isUser = authenticated && !isMaster
  const homePath = authenticated ? homePathFor(state.me.role) : '/'
  const section = sectionLabel(pathname)

  const realName = state.status === 'authenticated' ? state.me.realName : ''

  return (
    <RatesProvider enabled={!isMaster && state.status !== 'loading'}>
    <div className={isUser ? 'app with-tabbar' : 'app'}>
      <aside className={menuOpen ? 'app-sidebar open' : 'app-sidebar'} id="app-menu">
        <Link to={homePath} className="app-title">
          TravelPay <span className="app-title-sub">글로벌 여행 금융</span>
        </Link>
        <nav className="app-nav" aria-label="전체 메뉴">
          {isMaster && <MenuLinks items={MASTER_MENU} />}
          {isUser && <MenuLinks items={USER_MENU} />}
          {state.status === 'anonymous' && <MenuLinks items={ANONYMOUS_MENU} />}
        </nav>
        {authenticated && (
          <nav className="app-nav app-nav-bottom" aria-label="계정 메뉴">
            {isUser && (
              <NavLink to="/me">
                <Icon name="user" />
                내 정보
                <span className="app-nav-label">{realName}</span>
              </NavLink>
            )}
            <NavLink to="/account/password">
              <Icon name="lock" />
              비밀번호 변경
              {isMaster && <span className="app-nav-label">{realName}(관리자)</span>}
            </NavLink>
            <button type="button" className="app-logout" onClick={handleLogout} disabled={loggingOut}>
              <Icon name="logout" />
              로그아웃
            </button>
          </nav>
        )}
      </aside>
      {menuOpen && <div className="app-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />}

      <div className="app-content">
        <header className="app-topbar">
          <Link to={homePath} className="app-topbar-brand">
            TravelPay
          </Link>
          <div className="app-topbar-left">
            <p className="app-breadcrumb">
              홈{section && <> / {section}</>}
            </p>
            {!isMaster && <RateTicker />}
          </div>
          <div className="app-user">
            {authenticated && (
              <Link to={isMaster ? '/account/password' : '/me'} className="app-profile">
                <span className="app-avatar" aria-hidden="true">
                  {realName.slice(0, 1)}
                </span>
                <span className="app-user-name">
                  {realName}님{isMaster && <span className="app-user-role">(관리자)</span>}
                </span>
              </Link>
            )}
            <button
              type="button"
              className="app-menu-button"
              aria-expanded={menuOpen}
              aria-controls="app-menu"
              onClick={() => setMenuOpen((open) => !open)}
            >
              메뉴
            </button>
          </div>
        </header>
        <main className="app-main">
          <Outlet />
        </main>
      </div>

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
