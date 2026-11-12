import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { isApiError } from '../api'
import {
  fetchCharges,
  fetchMyBalances,
  fetchMyWallet,
  openWallet,
  type Balance,
  type Charge,
  type Wallet,
} from '../features/wallet/api'
import { CURRENCY_TEXT, CurrencyMark } from '../components/CurrencyMark'
import { ChargeStatusBadge } from '../features/wallet/ChargeStatusBadge'
import { toWalletMessage } from '../features/wallet/status'
import { formatDateTime } from '../lib/datetime'
import { CURRENCY_INFO, formatAmount } from '../lib/money'

type Loaded =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'none' }
  | { kind: 'wallet'; wallet: Wallet; balances: Balance[] | null; balanceError: string | null; charges: Charge[] }

const RECENT_CHARGES = 5

export function WalletPage() {
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' })
  const [opening, setOpening] = useState(false)
  const [openError, setOpenError] = useState<string | null>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    let wallet: Wallet
    try {
      wallet = await fetchMyWallet(signal)
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') {
        return
      }
      if (isApiError(cause) && cause.code === 'WALLET_NOT_FOUND') {
        setLoaded({ kind: 'none' })
      } else {
        setLoaded({ kind: 'error', message: toWalletMessage(cause, '지갑을 불러오지 못했습니다.') })
      }
      return
    }
    if (wallet.status !== 'ACTIVE') {
      setLoaded({ kind: 'wallet', wallet, balances: null, balanceError: null, charges: [] })
      return
    }
    // 잔액(원장)이 실패해도 충전 내역은 보여 준다.
    const [balances, charges] = await Promise.allSettled([
      fetchMyBalances(signal),
      fetchCharges({ size: RECENT_CHARGES }, signal),
    ])
    if (signal?.aborted) {
      return
    }
    setLoaded({
      kind: 'wallet',
      wallet,
      balances: balances.status === 'fulfilled' ? balances.value : null,
      balanceError:
        balances.status === 'rejected' ? toWalletMessage(balances.reason, '잔액을 불러오지 못했습니다.') : null,
      charges: charges.status === 'fulfilled' ? charges.value.items : [],
    })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  async function handleOpen() {
    setOpening(true)
    setOpenError(null)
    try {
      await openWallet()
      await load()
    } catch (cause) {
      // 개설은 회원당 하나라 재요청이 멱등이다. 실패하면 같은 버튼으로 다시 시도하면 된다.
      setOpenError(toWalletMessage(cause, '지갑을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.'))
    } finally {
      setOpening(false)
    }
  }

  if (loaded.kind === 'loading') {
    return <p className="loading">불러오는 중입니다…</p>
  }
  if (loaded.kind === 'error') {
    return (
      <section>
        <h1>내 지갑</h1>
        <p className="error" role="alert">
          {loaded.message}
        </p>
      </section>
    )
  }

  const pending = loaded.kind === 'wallet' && loaded.wallet.status === 'PENDING'
  if (loaded.kind === 'none' || pending) {
    return (
      <section>
        <h1>내 지갑</h1>
        <p>
          {pending
            ? '지갑을 만드는 중에 멈췄습니다. 아래 버튼을 누르면 이어서 만듭니다.'
            : '아직 지갑이 없습니다. 지갑을 만들면 원화·엔화·위안화를 보관하고 송금할 수 있습니다.'}
        </p>
        {openError && (
          <p className="error" role="alert">
            {openError}
          </p>
        )}
        <button type="button" className="primary" onClick={handleOpen} disabled={opening}>
          {opening ? '만드는 중…' : pending ? '이어서 만들기' : '지갑 만들기'}
        </button>
      </section>
    )
  }

  const { wallet, balances, balanceError, charges } = loaded
  if (wallet.status !== 'ACTIVE') {
    return (
      <section>
        <h1>내 지갑</h1>
        <p className="error">지갑이 {wallet.status === 'SUSPENDED' ? '정지' : '해지'}되어 사용할 수 없습니다.</p>
      </section>
    )
  }

  return (
    <section>
      <div className="title-row">
        <h1>내 지갑</h1>
        <div className="actions inline">
          <Link to="/wallet/charge" className="button-link">
            충전하기
          </Link>
          <Link to="/transfers/new">송금하기</Link>
        </div>
      </div>

      {balanceError && (
        <p className="error" role="alert">
          {balanceError}{' '}
          <button type="button" className="link-button" onClick={() => load()}>
            다시 불러오기
          </button>
        </p>
      )}
      {balances && (
        <section className="page-section" aria-labelledby="wallet-currencies">
          <div className="section-head">
            <h2 id="wallet-currencies">보유 통화</h2>
          </div>
          <ul className="panel row-list">
            {balances.map((item) => (
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
          <p className="section-note">충전은 원화(KRW)만 할 수 있습니다.</p>
        </section>
      )}

      <section className="page-section" aria-labelledby="wallet-charges">
        <div className="section-head">
          <h2 id="wallet-charges">최근 충전</h2>
          <Link to="/wallet/charges">전체 보기</Link>
        </div>
        {charges.length === 0 && <p className="hint empty">충전 내역이 없습니다.</p>}
        {charges.length > 0 && (
          <ul className="panel item-list">
            {charges.map((charge) => (
              <li key={charge.chargeId}>
                <Link to={`/wallet/charges/${charge.chargeId}`} className="item">
                  <span className="item-main">
                    <span>충전</span>
                    <span className="amount received">+{formatAmount(charge.amount, charge.currency)}</span>
                  </span>
                  <span className="item-sub">
                    <span className="hint">{formatDateTime(charge.createdAt)}</span>
                    <ChargeStatusBadge status={charge.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  )
}
