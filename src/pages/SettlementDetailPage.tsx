import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { fetchSettlement, type SettlementDetail } from '../features/merchant/api'
import { SettlementStatusBadge } from '../features/merchant/SettlementStatusBadge'
import { SETTLEMENT_DESCRIPTION, SETTLEMENT_FROM_DEPOSITS, toMerchantMessage } from '../features/merchant/status'
import { formatDateTime } from '../lib/datetime'
import { formatAmount } from '../lib/money'

const POLL_INTERVAL_MS = 3000
const POLL_LIMIT_MS = 2 * 60 * 1000

export function SettlementDetailPage() {
  const { merchantId = '', settlementId = '' } = useParams()
  const location = useLocation()
  const state = location.state as { justRequested?: boolean; from?: string } | null
  const justRequested = state?.justRequested === true
  // 지갑의 정산 입금 내역에서 들어왔으면 돌아갈 곳도 입금 내역이다(가맹점 정산 화면 아님).
  const fromDeposits = state?.from === SETTLEMENT_FROM_DEPOSITS

  const [detail, setDetail] = useState<SettlementDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pollStopped, setPollStopped] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    const startedAt = Date.now()
    let timer: number | undefined
    /** 한 번이라도 받아 화면에 보여 준 값이 있는지. */
    let loaded = false

    function scheduleNext() {
      if (Date.now() - startedAt < POLL_LIMIT_MS) {
        timer = window.setTimeout(load, POLL_INTERVAL_MS)
      } else {
        setPollStopped(true)
      }
    }

    async function load() {
      try {
        const data = await fetchSettlement(merchantId, settlementId, controller.signal)
        setDetail(data)
        loaded = true
        setError(null)
        if (data.settlement.status === 'REQUESTED') {
          scheduleNext()
        }
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') {
          return
        }
        // 처리 중 다시 조회하다 실패한 것은 일시 오류로 보고 마지막 값을 둔 채 이어서 확인한다.
        if (loaded) {
          scheduleNext()
          return
        }
        setError(toMerchantMessage(cause, '정산을 불러오지 못했습니다.'))
      }
    }

    setDetail(null)
    setPollStopped(false)
    load()
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [merchantId, settlementId])

  const listLink = fromDeposits ? '/wallet/settlements' : `/merchant/${merchantId}/settlements`
  const listLabel = fromDeposits ? '정산 입금 내역' : '정산 내역'

  if (error) {
    return (
      <section>
        <h1>정산 상세</h1>
        <p className="error" role="alert">
          {error}
        </p>
        <Link to={listLink}>{fromDeposits ? '정산 입금 내역으로' : '정산으로'}</Link>
      </section>
    )
  }
  if (!detail) {
    return <p className="loading">불러오는 중입니다…</p>
  }

  const { settlement, items } = detail
  const description = SETTLEMENT_DESCRIPTION[settlement.status]

  return (
    <section>
      <h1>정산 상세</h1>
      {justRequested && settlement.status === 'PAID' && <p className="notice">정산을 완료했습니다.</p>}

      <p className="amount-large">
        {formatAmount(settlement.amount, settlement.currency)} <SettlementStatusBadge status={settlement.status} />
      </p>
      {description && <p className="hint">{description}</p>}
      {settlement.failureReason && <p className="error">거절 사유: {settlement.failureReason}</p>}
      {settlement.status === 'REQUESTED' && !pollStopped && <p className="hint">결과를 자동으로 확인하는 중입니다…</p>}
      {pollStopped && <p className="hint">처리가 늦어지고 있습니다. 잠시 후 다시 확인해 주세요.</p>}

      <dl className="info">
        <dt>결제 건수</dt>
        <dd>{settlement.paymentCount}건</dd>
        <dt>요청 시각</dt>
        <dd>{formatDateTime(settlement.createdAt)}</dd>
        {settlement.paidAt && (
          <>
            <dt>입금 시각</dt>
            <dd>{formatDateTime(settlement.paidAt)}</dd>
          </>
        )}
        <dt>정산 ID</dt>
        <dd>
          <code>{settlement.settlementId}</code>
        </dd>
      </dl>

      {items.length > 0 && (
        <>
          <h2>포함된 결제</h2>
          <ul className="item-list">
            {items.map((item) => (
              <li key={item.paymentId}>
                <Link to={`/merchant/${merchantId}/payments/${item.paymentId}`} className="item">
                  <span className="item-main">
                    <code className="hint">{item.paymentId}</code>
                    <span className="amount">{formatAmount(item.amount, settlement.currency)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="actions">
        <Link to={listLink}>{listLabel}</Link>
        {settlement.status === 'PAID' && <Link to="/wallet">내 지갑</Link>}
      </div>
    </section>
  )
}
