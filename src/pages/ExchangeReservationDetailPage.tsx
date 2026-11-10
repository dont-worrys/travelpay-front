import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { isApiError } from '../api'
import { cancelReservation, fetchReservation, type ExchangeReservation } from '../features/exchange/api'
import { ExchangeStatusBadge } from '../features/exchange/ExchangeStatusBadge'
import { ReservationStatusBadge } from '../features/exchange/ReservationStatusBadge'
import {
  EXCHANGE_TYPE_LABEL,
  RESERVATION_CANCEL_REASON_LABEL,
  reservationConditionText,
  reservationTriggerText,
  toExchangeMessage,
} from '../features/exchange/status'
import { formatDateTime } from '../lib/datetime'
import { formatMajorAmount } from '../lib/money'

/**
 * 예약 상세. 대기는 며칠씩 이어질 수 있어 자동으로 다시 조회하지 않고 새로고침 버튼을 둔다.
 */
export function ExchangeReservationDetailPage() {
  const { reservationId = '' } = useParams()
  const location = useLocation()
  const justReserved = (location.state as { justReserved?: boolean } | null)?.justReserved === true

  const [reservation, setReservation] = useState<ExchangeReservation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [cancelled, setCancelled] = useState(false)

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const data = await fetchReservation(reservationId, signal)
        setReservation(data)
        setError(null)
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') {
          return
        }
        setError(toExchangeMessage(cause, '예약을 불러오지 못했습니다.'))
      }
    },
    [reservationId],
  )

  useEffect(() => {
    const controller = new AbortController()
    setReservation(null)
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  async function handleRefresh() {
    setRefreshing(true)
    setActionError(null)
    await load()
    setRefreshing(false)
  }

  async function handleCancel() {
    if (!reservation || !window.confirm('이 예약을 취소할까요?')) {
      return
    }
    setCancelling(true)
    setActionError(null)
    try {
      setReservation(await cancelReservation(reservation.reservationId))
      setCancelled(true)
    } catch (cause) {
      setActionError(toExchangeMessage(cause, '취소하지 못했습니다.'))
      if (isApiError(cause) && cause.code === 'EXCHANGE_RESERVATION_NOT_WAITING') {
        // 그사이 체결·만료됐다. 지금 상태를 다시 보여 준다.
        await load()
      }
    } finally {
      setCancelling(false)
    }
  }

  if (error) {
    return (
      <section>
        <h1>예약 상세</h1>
        <p className="error" role="alert">
          {error}
        </p>
        <Link to="/exchange-reservations">예약 내역으로</Link>
      </section>
    )
  }
  if (!reservation) {
    return <p>불러오는 중입니다…</p>
  }

  return (
    <section>
      <h1>예약 {EXCHANGE_TYPE_LABEL[reservation.type]} 상세</h1>
      {justReserved && reservation.status === 'WAITING' && <p className="notice">예약을 등록했습니다.</p>}
      {cancelled && reservation.status === 'CANCELED' && <p className="notice">예약을 취소했습니다.</p>}

      <p className="amount-large">
        {formatMajorAmount(reservation.fromAmount, reservation.fromCurrency)} →{' '}
        {reservation.toCurrency} <ReservationStatusBadge status={reservation.status} />
      </p>
      {reservation.status === 'WAITING' && (
        <p className="hint">
          매매기준율이 {reservationTriggerText(reservation)} 자동으로 환전합니다. 잔액은 체결할 때 빠집니다.
        </p>
      )}
      {reservation.status === 'CANCELED' && reservation.cancelReason && (
        <p className="hint">{RESERVATION_CANCEL_REASON_LABEL[reservation.cancelReason]}</p>
      )}
      {reservation.status === 'EXPIRED' && <p className="hint">만료 시각까지 조건에 닿지 않아 환전하지 않았습니다.</p>}
      {reservation.status === 'EXECUTED' && (
        <p className="hint">
          조건에 닿아 환전 주문을 만들었습니다. 환전 결과는 주문 상태로 확인해 주세요
          {reservation.orderStatus && (
            <>
              {' '}
              <ExchangeStatusBadge status={reservation.orderStatus} />
            </>
          )}
          .
        </p>
      )}

      <dl className="info">
        <dt>보내는 금액</dt>
        <dd>{formatMajorAmount(reservation.fromAmount, reservation.fromCurrency)}</dd>
        <dt>받는 통화</dt>
        <dd>{reservation.toCurrency}</dd>
        <dt>체결 조건</dt>
        <dd>매매기준율 {reservationConditionText(reservation)}</dd>
        <dt>만료 시각</dt>
        <dd>{formatDateTime(reservation.expiresAt)}</dd>
        <dt>예약 시각</dt>
        <dd>{formatDateTime(reservation.createdAt)}</dd>
        {reservation.executedAt && (
          <>
            <dt>체결 시각</dt>
            <dd>{formatDateTime(reservation.executedAt)}</dd>
          </>
        )}
        <dt>예약 ID</dt>
        <dd>
          <code>{reservation.reservationId}</code>
        </dd>
      </dl>

      {actionError && (
        <p className="error" role="alert">
          {actionError}
        </p>
      )}

      <div className="actions">
        {reservation.orderId && (
          <Link to={`/exchanges/${reservation.orderId}`} className="button-link">
            환전 결과 보기
          </Link>
        )}
        {reservation.status === 'WAITING' && (
          <button type="button" className="secondary" onClick={handleCancel} disabled={cancelling}>
            {cancelling ? '취소 중…' : '예약 취소'}
          </button>
        )}
        {(reservation.status === 'WAITING' || reservation.orderStatus === 'PROCESSING') && (
          <button type="button" className="secondary" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? '확인 중…' : '새로고침'}
          </button>
        )}
        <Link to="/exchange-reservations">예약 내역</Link>
      </div>
    </section>
  )
}
