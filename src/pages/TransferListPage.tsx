import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { PageResponse } from '../api'
import { fetchTransfers, type Transfer, type TransferDirection } from '../features/transfer/api'
import { toTransferMessage } from '../features/transfer/status'
import { TransferStatusBadge } from '../features/transfer/TransferStatusBadge'
import { formatDateTime } from '../lib/datetime'
import { formatAmount } from '../lib/money'

const PAGE_SIZE = 20
const TABS: { label: string; direction?: TransferDirection }[] = [
  { label: '전체' },
  { label: '보낸 내역', direction: 'SENT' },
  { label: '받은 내역', direction: 'RECEIVED' },
]

export function TransferListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const directionParam = searchParams.get('direction')
  const direction: TransferDirection | undefined =
    directionParam === 'SENT' || directionParam === 'RECEIVED' ? directionParam : undefined
  const page = Math.max(0, Number.parseInt(searchParams.get('page') ?? '0', 10) || 0)

  const [result, setResult] = useState<PageResponse<Transfer> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setResult(null)
    setError(null)
    fetchTransfers({ direction, page, size: PAGE_SIZE }, controller.signal)
      .then(setResult)
      .catch((cause) => {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
          setError(toTransferMessage(cause, '송금 내역을 불러오지 못했습니다.'))
        }
      })
    return () => controller.abort()
  }, [direction, page])

  function go(next: { direction?: TransferDirection; page?: number }) {
    const params = new URLSearchParams()
    if (next.direction) {
      params.set('direction', next.direction)
    }
    if (next.page) {
      params.set('page', String(next.page))
    }
    setSearchParams(params)
  }

  return (
    <section>
      <div className="title-row">
        <h1>송금 내역</h1>
        <Link to="/transfers/new" className="button-link">
          송금하기
        </Link>
      </div>

      <div className="tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.label}
            type="button"
            role="tab"
            aria-selected={tab.direction === direction}
            className={tab.direction === direction ? 'tab active' : 'tab'}
            onClick={() => go({ direction: tab.direction })}
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
      {result && result.items.length === 0 && <p className="hint">송금 내역이 없습니다.</p>}

      {result && result.items.length > 0 && (
        <ul className="item-list">
          {result.items.map((item) => {
            const sent = item.direction === 'SENT'
            return (
              <li key={item.transferId}>
                <Link to={`/transfers/${item.transferId}`} className="item">
                  <span className="item-main">
                    <span>{sent ? '보냄' : '받음'}</span>
                    <span className={sent ? 'amount sent' : 'amount received'}>
                      {sent ? '-' : '+'}
                      {formatAmount(item.amount, item.currency)}
                    </span>
                  </span>
                  <span className="item-sub">
                    <span className="hint">
                      {formatDateTime(item.createdAt)}
                      {item.memo ? ` · ${item.memo}` : ''}
                    </span>
                    <TransferStatusBadge status={item.status} />
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {result && result.totalPages > 1 && (
        <div className="pagination">
          <button type="button" className="secondary" disabled={page <= 0} onClick={() => go({ direction, page: page - 1 })}>
            이전
          </button>
          <span>
            {result.page + 1} / {result.totalPages}
          </span>
          <button
            type="button"
            className="secondary"
            disabled={page + 1 >= result.totalPages}
            onClick={() => go({ direction, page: page + 1 })}
          >
            다음
          </button>
        </div>
      )}
    </section>
  )
}
