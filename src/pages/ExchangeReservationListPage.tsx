import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { PageResponse } from '../api'
import {
  fetchReservations,
  type ExchangeReservationSummary,
  type ReservationStatus,
} from '../features/exchange/api'
import { ReservationStatusBadge } from '../features/exchange/ReservationStatusBadge'
import { EXCHANGE_TYPE_LABEL, reservationConditionText, toExchangeMessage } from '../features/exchange/status'
import { formatDateTime } from '../lib/datetime'
import { formatMajorAmount } from '../lib/money'

const PAGE_SIZE = 20
const TABS: { label: string; status?: ReservationStatus }[] = [
  { label: '전체' },
  { label: '대기', status: 'WAITING' },
  { label: '체결', status: 'EXECUTED' },
  { label: '취소', status: 'CANCELED' },
  { label: '만료', status: 'EXPIRED' },
]

function isStatus(value: string | null): value is ReservationStatus {
  return TABS.some((tab) => tab.status === value)
}

export function ExchangeReservationListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const statusParam = searchParams.get('status')
  const status = isStatus(statusParam) ? statusParam : undefined
  const page = Math.max(0, Number.parseInt(searchParams.get('page') ?? '0', 10) || 0)

  const [result, setResult] = useState<PageResponse<ExchangeReservationSummary> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setResult(null)
    setError(null)
    fetchReservations({ status, page, size: PAGE_SIZE }, controller.signal)
      .then(setResult)
      .catch((cause) => {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
          setError(toExchangeMessage(cause, '예약 내역을 불러오지 못했습니다.'))
        }
      })
    return () => controller.abort()
  }, [status, page])

  function go(next: { status?: ReservationStatus; page?: number }) {
    const params = new URLSearchParams()
    if (next.status) {
      params.set('status', next.status)
    }
    if (next.page) {
      params.set('page', String(next.page))
    }
    setSearchParams(params)
  }

  return (
    <section>
      <div className="title-row">
        <h1>예약 내역</h1>
        <Link to="/exchange-reservations/new" className="button-link">
          예약하기
        </Link>
      </div>

      <div className="tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.label}
            type="button"
            role="tab"
            aria-selected={tab.status === status}
            className={tab.status === status ? 'tab active' : 'tab'}
            onClick={() => go({ status: tab.status })}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!result && !error && <p className="loading">불러오는 중입니다…</p>}
      {result && result.items.length === 0 && <p className="hint empty">예약 내역이 없습니다.</p>}

      {result && result.items.length > 0 && (
        <ul className="item-list">
          {result.items.map((item) => (
            <li key={item.reservationId}>
              <Link to={`/exchange-reservations/${item.reservationId}`} className="item">
                <span className="item-main">
                  <span>
                    {EXCHANGE_TYPE_LABEL[item.type]} {item.fromCurrency} → {item.toCurrency}
                  </span>
                  <span className="amount">{formatMajorAmount(item.fromAmount, item.fromCurrency)}</span>
                </span>
                <span className="item-sub">
                  <span className="hint">
                    {reservationConditionText(item)} · {formatDateTime(item.expiresAt)}까지
                  </span>
                  <ReservationStatusBadge status={item.status} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {result && result.totalPages > 1 && (
        <div className="pagination">
          <button type="button" className="secondary" disabled={page <= 0} onClick={() => go({ status, page: page - 1 })}>
            이전
          </button>
          <span>
            {result.page + 1} / {result.totalPages}
          </span>
          <button
            type="button"
            className="secondary"
            disabled={page + 1 >= result.totalPages}
            onClick={() => go({ status, page: page + 1 })}
          >
            다음
          </button>
        </div>
      )}
    </section>
  )
}
