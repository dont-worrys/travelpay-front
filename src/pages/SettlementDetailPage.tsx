import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { fetchSettlement, type SettlementDetail } from '../features/merchant/api'
import { SettlementStatusBadge } from '../features/merchant/SettlementStatusBadge'
import { SETTLEMENT_DESCRIPTION, toMerchantMessage } from '../features/merchant/status'
import { formatDateTime } from '../lib/datetime'
import { formatAmount } from '../lib/money'

const POLL_INTERVAL_MS = 3000
const POLL_LIMIT_MS = 2 * 60 * 1000

export function SettlementDetailPage() {
  const { merchantId = '', settlementId = '' } = useParams()
  const location = useLocation()
  const justRequested = (location.state as { justRequested?: boolean } | null)?.justRequested === true

  const [detail, setDetail] = useState<SettlementDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pollStopped, setPollStopped] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    const startedAt = Date.now()
    let timer: number | undefined

    async function load() {
      try {
        const data = await fetchSettlement(merchantId, settlementId, controller.signal)
        setDetail(data)
        setError(null)
        if (data.settlement.status === 'REQUESTED') {
          if (Date.now() - startedAt < POLL_LIMIT_MS) {
            timer = window.setTimeout(load, POLL_INTERVAL_MS)
          } else {
            setPollStopped(true)
          }
        }
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') {
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

  const listLink = `/merchant/${merchantId}/settlements`

  if (error) {
    return (
      <section>
        <h1>정산 상세</h1>
        <p className="error" role="alert">
          {error}
        </p>
        <Link to={listLink}>정산으로</Link>
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
        <Link to={listLink}>정산 내역</Link>
        {settlement.status === 'PAID' && <Link to="/wallet">내 지갑</Link>}
      </div>
    </section>
  )
}
