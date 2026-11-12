import { useEffect, useState } from 'react'
import { HistoryTabs } from '../components/HistoryTabs'
import { Link, useSearchParams } from 'react-router'
import type { PageResponse } from '../api'
import { StatusBadge } from '../components/StatusBadge'
import { fetchExchanges, type ExchangeOrderSummary, type ExchangeType } from '../features/exchange/api'
import { ExchangeStatusBadge } from '../features/exchange/ExchangeStatusBadge'
import { EXCHANGE_TYPE_LABEL, toExchangeMessage } from '../features/exchange/status'
import { formatDateTime } from '../lib/datetime'
import { formatMajorAmount } from '../lib/money'

const PAGE_SIZE = 20
const TABS: { label: string; type?: ExchangeType }[] = [
  { label: '전체' },
  { label: '환전', type: 'EXCHANGE' },
  { label: '재환전', type: 'RE_EXCHANGE' },
]

export function ExchangeListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const typeParam = searchParams.get('type')
  const type: ExchangeType | undefined = typeParam === 'EXCHANGE' || typeParam === 'RE_EXCHANGE' ? typeParam : undefined
  const page = Math.max(0, Number.parseInt(searchParams.get('page') ?? '0', 10) || 0)

  const [result, setResult] = useState<PageResponse<ExchangeOrderSummary> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setResult(null)
    setError(null)
    fetchExchanges({ type, page, size: PAGE_SIZE }, controller.signal)
      .then(setResult)
      .catch((cause) => {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
          setError(toExchangeMessage(cause, '환전 내역을 불러오지 못했습니다.'))
        }
      })
    return () => controller.abort()
  }, [type, page])

  function go(next: { type?: ExchangeType; page?: number }) {
    const params = new URLSearchParams()
    if (next.type) {
      params.set('type', next.type)
    }
    if (next.page) {
      params.set('page', String(next.page))
    }
    setSearchParams(params)
  }

  return (
    <section>
      <HistoryTabs />
      <div className="title-row">
        <h1>환전 내역</h1>
        <Link to="/exchange" className="button-link">
          환전하기
        </Link>
      </div>

      <div className="tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.label}
            type="button"
            role="tab"
            aria-selected={tab.type === type}
            className={tab.type === type ? 'tab active' : 'tab'}
            onClick={() => go({ type: tab.type })}
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
      {result && result.items.length === 0 && <p className="hint empty">환전 내역이 없습니다.</p>}

      {result && result.items.length > 0 && (
        <ul className="item-list">
          {result.items.map((item) => (
            <li key={item.orderId}>
              <Link to={`/exchanges/${item.orderId}`} className="item">
                <span className="item-main">
                  <span>
                    {EXCHANGE_TYPE_LABEL[item.type]} {item.fromCurrency} → {item.toCurrency}
                    {item.reservationId && (
                      <>
                        {' '}
                        <StatusBadge label="예약 체결" tone="neutral" />
                      </>
                    )}
                  </span>
                  <span className="amount received">+{formatMajorAmount(item.toAmount, item.toCurrency)}</span>
                </span>
                <span className="item-sub">
                  <span className="hint">
                    {formatDateTime(item.requestedAt)} · -{formatMajorAmount(item.totalDebitAmount, item.fromCurrency)}
                  </span>
                  <ExchangeStatusBadge status={item.status} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {result && result.totalPages > 1 && (
        <div className="pagination">
          <button type="button" className="secondary" disabled={page <= 0} onClick={() => go({ type, page: page - 1 })}>
            이전
          </button>
          <span>
            {result.page + 1} / {result.totalPages}
          </span>
          <button
            type="button"
            className="secondary"
            disabled={page + 1 >= result.totalPages}
            onClick={() => go({ type, page: page + 1 })}
          >
            다음
          </button>
        </div>
      )}
    </section>
  )
}
