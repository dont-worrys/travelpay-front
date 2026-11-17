import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router'
import { isApiError } from '../api'
import { CURRENCY_TEXT, CurrencyMark } from '../components/CurrencyMark'
import { Icon, type IconName } from '../components/Icon'
import { useSharedRates } from '../components/RatesProvider'
import { SendBanner } from '../components/SendBanner'
import { useAuth } from '../features/auth/useAuth'
import { RateTable } from '../features/exchange/RateTable'
import { fetchMyBalances, type Balance } from '../features/wallet/api'
import { toWalletMessage } from '../features/wallet/status'
import { CURRENCY_INFO, formatAmount } from '../lib/money'

/** 히어로 주요 기능 버튼. 송금하기만 주 버튼이고 나머지는 네이비 위 보조 버튼이다. */
const QUICK_ACTIONS: { to: string; label: string; icon: IconName; primary?: boolean }[] = [
  { to: '/transfers/new', label: '송금하기', icon: 'send', primary: true },
  { to: '/wallet/charge', label: '충전하기', icon: 'plus' },
  { to: '/exchange', label: '환전하기', icon: 'swap' },
  { to: '/payments/new', label: '결제하기', icon: 'card' },
]

const SHORTCUTS: { to: string; label: string }[] = [
  { to: '/payments', label: '거래내역' },
  { to: '/exchange-reservations', label: '예약 환전' },
  { to: '/merchant', label: '가맹점 관리' },
]

type BalanceState =
  | { kind: 'loading' }
  | { kind: 'ok'; balances: Balance[] }
  | { kind: 'no-wallet' }
  | { kind: 'error'; message: string }

/**
 * 홈(docs/convention/style.md 6-1). 네이비 히어로에 원화 잔액(통화 합산은 환산이 필요해 하지 않음)과 주요 기능,
 * 오른쪽에 환율표(레이아웃과 같은 응답을 공유). 아래로 내 지갑 통화 카드와 바로가기.
 * 비로그인은 소개 히어로 아래에 환율표(환전하기는 로그인으로 이어짐) → 송금 배너 순서로 보여 준다
 * (환율 조회는 공개 API라 로그인이 필요 없다).
 */
export function HomePage() {
  const { state } = useAuth()
  const isUser = state.status === 'authenticated' && state.me.role !== 'MASTER'
  const [balance, setBalance] = useState<BalanceState>({ kind: 'loading' })
  // 오늘의 환율(로그인 여부와 관계없이). 레이아웃 안이면 상단 티커와 같은 응답을 공유한다.
  const rates = useSharedRates()
  const hasRates = rates !== null && rates.length > 0
  useEffect(() => {
    if (!isUser) {
      return
    }
    const controller = new AbortController()
    fetchMyBalances(controller.signal)
      .then((balances) => setBalance({ kind: 'ok', balances }))
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') {
          return
        }
        if (isApiError(cause) && cause.code === 'WALLET_NOT_FOUND') {
          setBalance({ kind: 'no-wallet' })
        } else {
          setBalance({ kind: 'error', message: toWalletMessage(cause, '잔액을 불러오지 못했습니다.') })
        }
      })
    return () => controller.abort()
  }, [isUser])

  if (state.status === 'authenticated' && state.me.role === 'MASTER') {
    // 관리자는 일반회원 화면을 쓰지 않는다.
    return <Navigate to="/admin" replace />
  }

  if (state.status === 'loading') {
    return <p className="loading">로그인 상태를 확인하는 중입니다…</p>
  }

  if (state.status === 'anonymous') {
    return (
      <section className="home">
        <div className="home-hero intro">
          <div className="home-hero-inner narrow">
            <div>
              <p className="home-hero-label">TravelPay</p>
              <h1 className="home-hero-title">여행 경비를 지갑 하나로</h1>
              <p className="home-hero-sub">
                원화 충전부터 회원 간 송금, 가맹점 결제, 엔화·위안화 환전까지 한곳에서 관리하세요.
              </p>
            </div>
          </div>
        </div>
        <div className={hasRates ? 'home-body stacked' : 'home-body stacked plain'}>
          {hasRates && <RateTable rates={rates} anonymous />}
          <SendBanner />
        </div>
      </section>
    )
  }

  const krw = balance.kind === 'ok' ? balance.balances.find((item) => item.currency === 'KRW') : undefined

  return (
    <section className="home">
      <h1 className="visually-hidden">홈</h1>
      <div className="home-hero">
        <div className="home-hero-inner">
          <div>
            <p className="home-greeting">안녕하세요, {state.me.realName}님</p>
            {balance.kind === 'loading' && <p className="home-hero-label loading-delay">잔액을 불러오는 중입니다…</p>}
            {balance.kind === 'no-wallet' && (
              <>
                <p className="home-hero-label">원화 잔액</p>
                <p className="home-hero-sub">아직 지갑이 없어요. 지갑을 만들면 원화·엔화·위안화를 보관하고 송금할 수 있어요.</p>
              </>
            )}
            {balance.kind === 'error' && (
              <>
                <p className="home-hero-label">원화 잔액</p>
                <p className="home-hero-sub">잔액을 불러오지 못했어요.</p>
              </>
            )}
            {balance.kind === 'ok' && (
              <>
                <p className="home-hero-label">원화 잔액</p>
                <p className="home-hero-amount">{formatAmount(krw?.balance ?? 0, 'KRW')}</p>
              </>
            )}
            <nav className="home-actions" aria-label="자주 쓰는 기능">
              {QUICK_ACTIONS.map((action) => (
                <Link key={action.to} to={action.to} className={action.primary ? 'button-link' : 'button-link on-navy'}>
                  <Icon name={action.icon} />
                  {action.label}
                </Link>
              ))}
            </nav>
          </div>
          {hasRates && <RateTable rates={rates} className="home-side" />}
        </div>
      </div>

      <div className="home-body">
        <section className="card" aria-labelledby="home-wallet">
          <div className="card-head">
            <h2 id="home-wallet">내 지갑</h2>
            {balance.kind === 'ok' && (
              <Link to="/wallet" className="link-more">
                지갑 전체 보기
              </Link>
            )}
          </div>
          {balance.kind === 'loading' && <p className="loading">불러오는 중입니다…</p>}
          {balance.kind === 'no-wallet' && (
            <div className="hint empty">
              <p>아직 지갑이 없어요.</p>
              <Link to="/wallet" className="button-link">
                지갑 만들기
              </Link>
            </div>
          )}
          {balance.kind === 'error' && (
            <p className="error" role="alert">
              {balance.message} <Link to="/wallet">지갑에서 다시 보기</Link>
            </p>
          )}
          {balance.kind === 'ok' && balance.balances.length === 0 && (
            <p className="hint empty">보유한 통화가 없습니다.</p>
          )}
          {balance.kind === 'ok' && balance.balances.length > 0 && (
            <ul className="wallet-grid" aria-label="보유 통화">
              {balance.balances.map((item) => (
                <li key={item.currency} className="wallet-card">
                  <span className="wallet-card-head">
                    <CurrencyMark currency={item.currency} />
                    <span className="currency-name">
                      <strong>{item.currency}</strong>
                      <span>{CURRENCY_TEXT[item.currency]?.name ?? CURRENCY_INFO[item.currency]?.label}</span>
                    </span>
                  </span>
                  <p className="wallet-card-amount">{formatAmount(item.balance, item.currency)}</p>
                  <span className="wallet-card-foot">
                    <span>{CURRENCY_TEXT[item.currency]?.use}</span>
                    {item.currency === 'KRW' ? (
                      <Link to="/wallet/charge">충전</Link>
                    ) : (
                      <Link to={`/exchange?type=RE_EXCHANGE&currency=${item.currency}`}>원화로 환전</Link>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card" aria-labelledby="home-shortcuts">
          <div className="card-head">
            <h2 id="home-shortcuts">바로가기</h2>
          </div>
          <nav className="link-list" aria-labelledby="home-shortcuts">
            {SHORTCUTS.map((link) => (
              <Link key={link.to} to={link.to}>
                {link.label}
                <Icon name="chevron" />
              </Link>
            ))}
          </nav>
        </section>
      </div>
    </section>
  )
}
