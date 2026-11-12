import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router'
import { isApiError } from '../api'
import { CURRENCY_TEXT, CurrencyMark } from '../components/CurrencyMark'
import { Icon, type IconName } from '../components/Icon'
import { useSharedRates } from '../components/RatesProvider'
import { useAuth } from '../features/auth/useAuth'
import { formatFeeRate, PRE_QUOTE_FEE_RATE, RateChange } from '../features/exchange/rateDisplay'
import { fetchMyBalances, type Balance } from '../features/wallet/api'
import { toWalletMessage } from '../features/wallet/status'
import { CURRENCY_INFO, formatAmount, formatDecimalText } from '../lib/money'

const QUICK_ACTIONS: { to: string; label: string; icon: IconName }[] = [
  { to: '/wallet/charge', label: '충전', icon: 'plus' },
  { to: '/transfers/new', label: '송금', icon: 'send' },
  { to: '/payments/new', label: '결제', icon: 'card' },
  { to: '/exchange', label: '환전', icon: 'swap' },
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
 * 일반회원 홈. 원화 잔액을 가장 크게 두고(통화 합산은 환산이 필요해 하지 않음) 그 아래 자주 쓰는 기능,
 * 보유 통화 목록, 오늘의 환율(레이아웃과 같은 응답을 공유), 바로가기. 비로그인은 소개와 로그인 입구.
 */
export function HomePage() {
  const { state } = useAuth()
  const isUser = state.status === 'authenticated' && state.me.role !== 'MASTER'
  const [balance, setBalance] = useState<BalanceState>({ kind: 'loading' })

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
      <section className="page-wide home">
        <div className="home-hero">
          <p className="home-hero-label">TravelPay</p>
          <h1 className="home-hero-title">여행 경비를 지갑 하나로</h1>
          <p className="home-hero-sub">원화 충전부터 회원 간 송금, 가맹점 결제, 엔화·위안화 환전까지 한곳에서 관리하세요.</p>
          <div className="home-hero-cta">
            <Link to="/login" className="home-cta-primary">
              로그인
            </Link>
            <Link to="/signup" className="home-cta-secondary">
              회원가입
            </Link>
          </div>
        </div>
        <ul className="feature-list" aria-label="TravelPay 기능">
          {QUICK_ACTIONS.map((action) => (
            <li key={action.to}>
              <span className="feature-icon">
                <Icon name={action.icon} />
              </span>
              <strong>{action.label}</strong>
            </li>
          ))}
        </ul>
        <p className="home-note">
          <Link to="/exchange-rates">오늘의 환율 보기</Link>
        </p>
      </section>
    )
  }

  const krw = balance.kind === 'ok' ? balance.balances.find((item) => item.currency === 'KRW') : undefined

  return (
    <section className="page-wide home">
      <div className="page-head">
        <p className="page-eyebrow">안녕하세요, {state.me.realName}님</p>
        <h1>내 지갑</h1>
      </div>

      <div className="home-grid">
        <div className="home-main">
          <div className="home-hero">
            {balance.kind === 'loading' && <p className="home-hero-label">잔액을 불러오는 중입니다…</p>}
            {balance.kind === 'no-wallet' && (
              <>
                <p className="home-hero-label">아직 지갑이 없어요</p>
                <p className="home-hero-sub">지갑을 만들면 원화·엔화·위안화를 보관하고 송금할 수 있어요.</p>
                <div className="home-hero-cta">
                  <Link to="/wallet" className="home-cta-primary">
                    지갑 만들기
                  </Link>
                </div>
              </>
            )}
            {balance.kind === 'error' && (
              <>
                <p className="home-hero-label">잔액</p>
                <p className="home-hero-sub" role="alert">
                  {balance.message}
                </p>
                <div className="home-hero-cta">
                  <Link to="/wallet" className="home-cta-secondary">
                    지갑에서 다시 보기
                  </Link>
                </div>
              </>
            )}
            {balance.kind === 'ok' && (
              <>
                <p className="home-hero-label">원화 잔액</p>
                <p className="home-hero-amount">{formatAmount(krw?.balance ?? 0, 'KRW')}</p>
                <p className="home-hero-sub">충전은 원화(KRW)만 할 수 있어요</p>
              </>
            )}
            <nav className="home-actions" aria-label="자주 쓰는 기능">
              {QUICK_ACTIONS.map((action) => (
                <Link key={action.to} to={action.to} className="home-action">
                  <span className="home-action-icon">
                    <Icon name={action.icon} />
                  </span>
                  {action.label}
                </Link>
              ))}
            </nav>
          </div>

          {balance.kind === 'ok' && balance.balances.length > 0 && (
            <section className="page-section" aria-labelledby="home-currencies">
              <div className="section-head">
                <h2 id="home-currencies">보유 통화</h2>
                <Link to="/wallet">지갑 보기</Link>
              </div>
              <ul className="panel row-list">
                {balance.balances.map((item) => (
                  <li key={item.currency} className="currency-row">
                    <CurrencyMark currency={item.currency} />
                    <span className="currency-name">
                      <strong>{CURRENCY_TEXT[item.currency]?.name ?? CURRENCY_INFO[item.currency]?.label}</strong>
                      <span>{CURRENCY_TEXT[item.currency]?.use}</span>
                    </span>
                    <span className="currency-amount">
                      <strong>{formatAmount(item.balance, item.currency)}</strong>
                      {item.currency === 'KRW' ? (
                        <Link to="/wallet/charge">충전</Link>
                      ) : (
                        <Link to={`/exchange?type=RE_EXCHANGE&currency=${item.currency}`}>원화로 환전</Link>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="home-side">
          <TodayRates />
          <section className="page-section" aria-labelledby="home-shortcuts">
            <div className="section-head">
              <h2 id="home-shortcuts">바로가기</h2>
            </div>
            <nav className="panel link-list" aria-labelledby="home-shortcuts">
              {SHORTCUTS.map((link) => (
                <Link key={link.to} to={link.to}>
                  {link.label}
                  <Icon name="chevron" />
                </Link>
              ))}
            </nav>
          </section>
        </aside>
      </div>
    </section>
  )
}

/** 오늘의 환율(매매기준율·전일 대비). 레이아웃이 조회한 환율을 함께 쓰므로 요청이 늘지 않는다. */
function TodayRates() {
  const rates = useSharedRates()
  if (!rates || rates.length === 0) {
    return null
  }
  return (
    <section className="page-section" aria-labelledby="home-rates">
      <div className="section-head">
        <h2 id="home-rates">오늘의 환율</h2>
        <Link to="/exchange-rates">전체</Link>
      </div>
      <ul className="panel row-list">
        {rates.map((rate) => (
          <li key={rate.currency} className="rate-row">
            <span className="rate-row-name">
              <CurrencyMark currency={rate.currency} small />
              {rate.unit.toLocaleString('ko-KR')}
              {CURRENCY_INFO[rate.currency].unit}
            </span>
            <span className="rate-row-value">
              <strong>{formatDecimalText(rate.midRate)}원</strong>
              <RateChange rate={rate} />
            </span>
          </li>
        ))}
      </ul>
      <p className="section-note">
        매매기준율 기준이에요. 환전 수수료 {formatFeeRate(PRE_QUOTE_FEE_RATE)}는 견적에서 더해져요.
      </p>
    </section>
  )
}
