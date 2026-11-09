import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { PageResponse } from '../api'
import { fetchPayments, type PaymentStatus, type PaymentSummary } from '../features/payment/api'
import { PaymentStatusBadge } from '../features/payment/PaymentStatusBadge'
import { toPaymentMessage } from '../features/payment/status'
import { formatDateTime } from '../lib/datetime'
import { formatAmount } from '../lib/money'

const PAGE_SIZE = 20
const TABS: { label: string; status?: PaymentStatus }[] = [
  { label: '전체' },
  { label: '결제 완료', status: 'APPROVED' },
  { label: '환불 신청', status: 'REFUND_REQUESTED' },
  { label: '환불 완료', status: 'REFUNDED' },
]
const TAB_STATUSES = new Set<string>(TABS.flatMap((tab) => (tab.status ? [tab.status] : [])))

export function PaymentListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const statusParam = searchParams.get('status') ?? ''
  const status = TAB_STATUSES.has(statusParam) ? (statusParam as PaymentStatus) : undefined
  const page = Math.max(0, Number.parseInt(searchParams.get('page') ?? '0', 10) || 0)

  const [result, setResult] = useState<PageResponse<PaymentSummary> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setResult(null)
    setError(null)
    fetchPayments({ status, page, size: PAGE_SIZE }, controller.signal)
      .then(setResult)
      .catch((cause) => {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
          setError(toPaymentMessage(cause, '결제 내역을 불러오지 못했습니다.'))
        }
      })
    return () => controller.abort()
  }, [status, page])

  function go(next: { status?: PaymentStatus; page?: number }) {
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
        <h1>결제 내역</h1>
        <Link to="/payments/new" className="button-link">
          결제하기
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
      {!result && !error && <p>불러오는 중입니다…</p>}
      {result && result.items.length === 0 && <p className="hint">결제 내역이 없습니다.</p>}

      {result && result.items.length > 0 && (
        <ul className="item-list">
          {result.items.map((item) => (
            <li key={item.paymentId}>
              <Link to={`/payments/${item.paymentId}`} className="item">
                <span className="item-main">
                  <span>{item.merchantName}</span>
                  <span className="amount sent">-{formatAmount(item.amount, item.currency)}</span>
                </span>
                <span className="item-sub">
                  <span className="hint">{formatDateTime(item.createdAt)}</span>
                  <PaymentStatusBadge status={item.status} />
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
