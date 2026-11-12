import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { fetchExchange, type ExchangeOrder } from '../features/exchange/api'
import { ExchangeStatusBadge } from '../features/exchange/ExchangeStatusBadge'
import { formatFeeRate } from '../features/exchange/rateDisplay'
import {
  EXCHANGE_DESCRIPTION,
  EXCHANGE_TYPE_LABEL,
  FAILURE_REASON_LABEL,
  toExchangeMessage,
} from '../features/exchange/status'
import { formatDateTime } from '../lib/datetime'
import { CURRENCY_INFO, formatDecimalText, formatMajorAmount } from '../lib/money'

/** PROCESSING 주문을 다시 조회하는 간격과 최대 시간. 서버 복구 스케줄러가 자동으로 다시 처리한다. */
const POLL_INTERVAL_MS = 3000
const POLL_LIMIT_MS = 2 * 60 * 1000

export function ExchangeDetailPage() {
  const { orderId = '' } = useParams()
  const location = useLocation()
  const justExchanged = (location.state as { justExchanged?: boolean } | null)?.justExchanged === true

  const [order, setOrder] = useState<ExchangeOrder | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pollStopped, setPollStopped] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    const startedAt = Date.now()
    let timer: number | undefined

    async function load() {
      try {
        const data = await fetchExchange(orderId, controller.signal)
        setOrder(data)
        setError(null)
        if (data.status === 'PROCESSING') {
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
        setError(toExchangeMessage(cause, '환전 내역을 불러오지 못했습니다.'))
      }
    }

    setOrder(null)
    setPollStopped(false)
    load()
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [orderId])

  if (error) {
    return (
      <section>
        <h1>환전 상세</h1>
        <p className="error" role="alert">
          {error}
        </p>
        <Link to="/exchanges">환전 내역으로</Link>
      </section>
    )
  }
  if (!order) {
    return <p>불러오는 중입니다…</p>
  }

  const description = EXCHANGE_DESCRIPTION[order.status]
  const foreign = order.toCurrency === 'KRW' ? order.fromCurrency : order.toCurrency
  const unitLabel = `${order.rateUnit.toLocaleString('ko-KR')}${CURRENCY_INFO[foreign].unit}`

  return (
    <section>
      <h1>{EXCHANGE_TYPE_LABEL[order.type]} 상세</h1>
      {justExchanged && order.status === 'COMPLETED' && <p className="notice">환전을 완료했습니다.</p>}

      <p className="amount-large">
        +{formatMajorAmount(order.toAmount, order.toCurrency)} <ExchangeStatusBadge status={order.status} />
      </p>
      {description && <p className="hint">{description}</p>}
      {order.failureReason && <p className="error">{FAILURE_REASON_LABEL[order.failureReason]}</p>}
      {order.status === 'PROCESSING' && !pollStopped && <p className="hint">결과를 자동으로 확인하는 중입니다…</p>}
      {pollStopped && (
        <p className="hint">
          처리가 늦어지고 있습니다. 잠시 후 <Link to="/exchanges">환전 내역</Link>에서 확인해 주세요.
        </p>
      )}

      <dl className="info">
        {order.reservationId && (
          <>
            <dt>구분</dt>
            <dd>
              예약 체결 주문 · <Link to={`/exchange-reservations/${order.reservationId}`}>예약 상세 보기</Link>
            </dd>
          </>
        )}
        <dt>보낸 금액</dt>
        <dd>{formatMajorAmount(order.fromAmount, order.fromCurrency)}</dd>
        <dt>수수료</dt>
        <dd>
          {formatMajorAmount(order.feeAmount, order.fromCurrency)} (수수료율 {formatFeeRate(order.feeRate)})
        </dd>
        <dt>지갑에서 빠진 금액</dt>
        <dd className="amount">{formatMajorAmount(order.totalDebitAmount, order.fromCurrency)}</dd>
        <dt>적용 환율</dt>
        <dd>
          {unitLabel}당 {formatDecimalText(order.appliedRate)}원 (기준일 {order.rateDate})
        </dd>
        <dt>신청 시각</dt>
        <dd>{formatDateTime(order.requestedAt)}</dd>
        {order.settledAt && (
          <>
            <dt>확정 시각</dt>
            <dd>{formatDateTime(order.settledAt)}</dd>
          </>
        )}
        <dt>주문 ID</dt>
        <dd>
          <code>{order.orderId}</code>
        </dd>
      </dl>

      <div className="actions">
        <Link to="/exchanges">환전 내역</Link>
        <Link to="/wallet">내 지갑</Link>
        {order.status === 'FAILED' && <Link to="/exchange">다시 환전하기</Link>}
      </div>
    </section>
  )
}
