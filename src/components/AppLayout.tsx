import { Suspense, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate, useNavigationType } from 'react-router'
import { homePathFor } from '../features/auth/RequireRole'
import { useAuth } from '../features/auth/useAuth'
import { NotificationBell } from '../features/notification/NotificationBell'
import { NotificationProvider } from '../features/notification/NotificationProvider'
import { BrandMark } from './BrandMark'
import { HISTORY_TABS } from './HistoryTabs'
import { Icon, type IconName } from './Icon'
import { PageLoading } from './PageLoading'
import { RatesProvider } from './RatesProvider'
import { RateTicker } from './RateTicker'

/**
 * 거래 기록 화면: 내역 탭의 목록(충전·송금·환전·결제·정산)과 각 기록의 상세. 송금하기·결제하기 같은 작성 화면(`/new`)은 빼고,
 * 송금·결제를 마친 뒤 넘어가는 상세도 기록이라 "내역"으로 표시한다.
 */
function isHistoryPath(path: string): boolean {
  return HISTORY_TABS.some(({ to }) => path === to || (path.startsWith(`${to}/`) && path !== `${to}/new`))
}

/** 메뉴별 선택 표시. 상단 메뉴·서랍·모바일 하단 탭이 같은 규칙을 쓴다. */
const IS_ACTIVE = {
  home: (path: string) => path === '/',
  wallet: (path: string) => path === '/wallet' || path === '/wallet/charge',
  transfer: (path: string) => path === '/transfers/new',
  payment: (path: string) => path === '/payments/new',
  exchange: (path: string) => path === '/exchange' || path.startsWith('/exchange-'),
  merchant: (path: string) => path === '/merchant' || path.startsWith('/merchant/'),
  history: isHistoryPath,
}

/** 내역은 첫 탭(충전 내역)에서 시작한다. */
const HISTORY_HOME = HISTORY_TABS[0]?.to ?? '/wallet/charges'

/**
 * 모바일 하단 탭바(일반회원). 송금·환전은 바로 그 일을 하는 화면으로, "내역"은 거래내역 도메인 탭
 * (충전·송금·환전·결제·정산 내역)으로 가며 충전 내역에서 시작한다.
 */
const USER_TABS: { to: string; label: string; icon: IconName; isActive: (path: string) => boolean }[] = [
  { to: '/', label: '홈', icon: 'home', isActive: IS_ACTIVE.home },
  { to: '/wallet', label: '지갑·충전', icon: 'wallet', isActive: IS_ACTIVE.wallet },
  { to: '/transfers/new', label: '송금', icon: 'send', isActive: IS_ACTIVE.transfer },
  { to: '/exchange', label: '환전', icon: 'swap', isActive: IS_ACTIVE.exchange },
  { to: HISTORY_HOME, label: '내역', icon: 'list', isActive: IS_ACTIVE.history },
]

/** `isActive`가 있으면 그 규칙으로, 없으면 NavLink 기본(경로 앞부분 일치)으로 선택 표시한다. */
type MenuItem = { to: string; label: string; icon: IconName; isActive?: (path: string) => boolean }

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

/** 일반회원 상단 메뉴·서랍. 송금·결제는 바로 그 일을 하는 화면으로 가고, 지난 기록은 맨 끝 "내역"에 모은다. */
const USER_MENU: MenuItem[] = [
  { to: '/wallet', label: '지갑', icon: 'wallet', isActive: IS_ACTIVE.wallet },
  { to: '/transfers/new', label: '송금', icon: 'send', isActive: IS_ACTIVE.transfer },
  { to: '/payments/new', label: '결제', icon: 'card', isActive: IS_ACTIVE.payment },
  { to: '/exchange', label: '환전', icon: 'swap', isActive: IS_ACTIVE.exchange },
  { to: '/merchant', label: '가맹점', icon: 'store', isActive: IS_ACTIVE.merchant },
  { to: HISTORY_HOME, label: '내역', icon: 'list', isActive: IS_ACTIVE.history },
]

/** 비로그인 가로 메뉴(환율만). 헤더 오른쪽에는 로그인 버튼만 둔다(회원가입은 로그인 화면과 서랍에서). */
const ANONYMOUS_NAV: MenuItem[] = [{ to: '/exchange-rates', label: '환율', icon: 'chart' }]

const ANONYMOUS_AUTH: MenuItem[] = [
  { to: '/login', label: '로그인', icon: 'login' },
  { to: '/signup', label: '회원가입', icon: 'user' },
]

function MenuLinks({ items }: { items: MenuItem[] }) {
  const { pathname } = useLocation()
  return (
    <>
      {items.map((item) => {
        if (!item.isActive) {
          return (
            <NavLink key={item.to} to={item.to}>
              <Icon name={item.icon} />
              {item.label}
            </NavLink>
          )
        }
        const active = item.isActive(pathname)
        return (
          <Link key={item.to} to={item.to} className={active ? 'active' : undefined} aria-current={active ? 'page' : undefined}>
            <Icon name={item.icon} />
            {item.label}
          </Link>
        )
      })}
    </>
  )
}

/** 계정 메뉴 항목(헤더 이름 메뉴와 서랍 아래에 같은 항목). */
function AccountLinks({ loggingOut, onLogout }: { loggingOut: boolean; onLogout: () => void }) {
  return (
    <>
      <NavLink to="/me">
        <Icon name="user" />내 정보
      </NavLink>
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
 * 공통 레이아웃(docs/convention/style.md 5절). 1024px 이상은 네이비 그라디언트 가로 헤더(로고 · 메뉴 · 환율 티커 ·
 * 계정 또는 로그인 버튼), 그보다 좁으면 헤더 + 메뉴 서랍(아이콘 버튼), 768px 미만 일반회원은 하단 탭바.
 * 맨 아래에 그라디언트 푸터. 메뉴 링크 텍스트·경로와 일반회원·관리자·비로그인 분기는 그대로다.
 */
export function AppLayout() {
  const { state, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const navigationType = useNavigationType()
  const [loggingOut, setLoggingOut] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const accountRef = useRef<HTMLDivElement>(null)

  // 링크로 다른 화면에 가면 맨 위에서 시작한다(뒤로 가기는 브라우저가 위치를 복원한다).
  useEffect(() => {
    if (navigationType !== 'POP') {
      document.documentElement.scrollTop = 0
    }
  }, [pathname, navigationType])

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

  const anonymous = state.status === 'anonymous'
  const navMenu = (
    <>
      {isMaster && <MenuLinks items={MASTER_MENU} />}
      {isUser && <MenuLinks items={USER_MENU} />}
      {anonymous && <MenuLinks items={ANONYMOUS_NAV} />}
    </>
  )
  const drawerMenu = (
    <>
      {navMenu}
      {anonymous && <MenuLinks items={ANONYMOUS_AUTH} />}
    </>
  )

  return (
    <RatesProvider enabled={!isMaster && state.status !== 'loading'}>
      {/* 알림은 일반회원만(MASTER는 서버가 403). 읽지 않은 개수를 헤더 배지와 알림 목록이 같이 쓴다. */}
      <NotificationProvider enabled={isUser}>
        <div className={isUser ? 'app with-tabbar' : 'app'}>
          <header className="app-header">
            <div className="app-header-inner">
              <Link to={homePath} className="app-logo">
                <BrandMark className="app-logo-mark" size={40} />
                <span className="app-logo-name">TravelPay</span>
              </Link>
              <nav className="app-nav" aria-label="전체 메뉴">
                {navMenu}
              </nav>
              <div className="app-header-right">
                {!isMaster && <RateTicker />}
                {anonymous && (
                  <nav className="app-auth" aria-label="로그인">
                    <NavLink to="/login" className="app-auth-primary">
                      로그인
                    </NavLink>
                  </nav>
                )}
                {isUser && <NotificationBell />}
                {authenticated && (
                  <div className="app-account" ref={accountRef}>
                    <button
                      type="button"
                      className="app-profile"
                      aria-expanded={accountOpen}
                      aria-controls="app-account-menu"
                      onClick={() => setAccountOpen((open) => !open)}
                    >
                      <span className="app-user-name">
                        {realName} 님{isMaster && <span className="app-user-role">(관리자)</span>}
                      </span>
                      <Icon name="chevron" className="app-profile-caret" />
                    </button>
                    {accountOpen && (
                      <nav className="app-account-menu" id="app-account-menu" aria-label="계정 메뉴">
                        <AccountLinks loggingOut={loggingOut} onLogout={handleLogout} />
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
                  <span className="visually-hidden">메뉴</span>
                </button>
              </div>
            </div>
          </header>

          {menuOpen && (
            <>
              <div className="app-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />
              <div className="app-drawer" id="app-drawer">
                <nav className="app-drawer-nav" aria-label="전체 메뉴">
                  {drawerMenu}
                </nav>
                {authenticated && (
                  <nav className="app-drawer-nav app-drawer-account" aria-label="계정 메뉴">
                    <AccountLinks loggingOut={loggingOut} onLogout={handleLogout} />
                  </nav>
                )}
              </div>
            </>
          )}

          <main className="app-main">
            {/* 화면 코드는 라우트별 청크라(router.tsx) 처음 열 때 내려받는 동안 본문 자리에만 로딩을 보인다. */}
            <Suspense fallback={<PageLoading />}>
              <Outlet />
            </Suspense>
          </main>

          <footer className="app-footer">
            <div className="app-footer-inner">
              <p className="app-footer-tagline">TravelPay</p>
              <p>원화 충전, 회원 간 송금, 가맹점 결제, 엔화·위안화 환전을 한곳에서.</p>
              <p className="app-footer-copyright">© 2026 DontWorry. All rights reserved.</p>
            </div>
          </footer>

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
      </NotificationProvider>
    </RatesProvider>
  )
}
