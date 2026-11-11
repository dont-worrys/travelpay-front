import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { PageResponse } from '../api'
import { fetchCharges, type Charge } from '../features/wallet/api'
import { ChargeStatusBadge } from '../features/wallet/ChargeStatusBadge'
import { bankName, toWalletMessage } from '../features/wallet/status'
import { formatDateTime } from '../lib/datetime'
import { formatAmount } from '../lib/money'

const PAGE_SIZE = 20

export function ChargeListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const page = Math.max(0, Number.parseInt(searchParams.get('page') ?? '0', 10) || 0)

  const [result, setResult] = useState<PageResponse<Charge> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setResult(null)
    setError(null)
    fetchCharges({ page, size: PAGE_SIZE }, controller.signal)
      .then(setResult)
      .catch((cause) => {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
          setError(toWalletMessage(cause, '충전 내역을 불러오지 못했습니다.'))
        }
      })
    return () => controller.abort()
  }, [page])

  function goTo(next: number) {
    setSearchParams(next > 0 ? { page: String(next) } : {})
  }

  return (
    <section>
      <div className="title-row">
        <h1>충전 내역</h1>
        <Link to="/wallet/charge" className="button-link">
          충전하기
        </Link>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!result && !error && <p>불러오는 중입니다…</p>}
      {result && result.items.length === 0 && <p className="hint">충전 내역이 없습니다.</p>}

      {result && result.items.length > 0 && (
        <ul className="item-list">
          {result.items.map((charge) => (
            <li key={charge.chargeId}>
              <Link to={`/wallet/charges/${charge.chargeId}`} className="item">
                <span className="item-main">
                  <span>
                    {bankName(charge.bankCode)} {charge.accountNumberMask.slice(-4)}
                  </span>
                  <span className="amount received">+{formatAmount(charge.amount, charge.currency)}</span>
                </span>
                <span className="item-sub">
                  <span className="hint">
                    {formatDateTime(charge.createdAt)}
                    {charge.failureMessage ? ` · ${charge.failureMessage}` : ''}
                  </span>
                  <ChargeStatusBadge status={charge.status} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {result && result.totalPages > 1 && (
        <div className="pagination">
          <button type="button" className="secondary" disabled={page <= 0} onClick={() => goTo(page - 1)}>
            이전
          </button>
          <span>
            {result.page + 1} / {result.totalPages}
          </span>
          <button
            type="button"
            className="secondary"
            disabled={page + 1 >= result.totalPages}
            onClick={() => goTo(page + 1)}
          >
            다음
          </button>
        </div>
      )}
    </section>
  )
}
