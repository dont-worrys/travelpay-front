import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { PageResponse } from '../api'
import { HistoryTabs } from '../components/HistoryTabs'
import { fetchMySettlements, type Settlement } from '../features/merchant/api'
import { settlementMerchantLabel, settlementPaidTime, toMerchantMessage } from '../features/merchant/status'
import { formatDateTime } from '../lib/datetime'
import { formatAmount } from '../lib/money'

const PAGE_SIZE = 20

/** 정산 입금 내역: 내 가맹점 정산 중 지갑에 입금된(`PAID`) 것. 순서는 서버 정렬(요청 시각 최신순) 그대로 둔다. */
export function SettlementDepositListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const page = Math.max(0, Number.parseInt(searchParams.get('page') ?? '0', 10) || 0)

  const [result, setResult] = useState<PageResponse<Settlement> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setResult(null)
    setError(null)
    fetchMySettlements({ status: 'PAID', page, size: PAGE_SIZE }, controller.signal)
      .then(setResult)
      .catch((cause) => {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
          setError(toMerchantMessage(cause, '정산 입금 내역을 불러오지 못했습니다.'))
        }
      })
    return () => controller.abort()
  }, [page])

  function goTo(next: number) {
    setSearchParams(next > 0 ? { page: String(next) } : {})
  }

  return (
    <section>
      <HistoryTabs />
      <div className="title-row">
        <h1>정산 입금 내역</h1>
      </div>
      <p className="hint">
        내 가맹점의 정산금이 지갑에 들어온 내역입니다. 정산을 요청한 순서로 보여 주며, 운영자 확인을 거친 정산은
        입금 시각이 순서와 다를 수 있습니다.
      </p>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!result && !error && <p className="loading">불러오는 중입니다…</p>}
      {result && result.items.length === 0 && <p className="hint empty">정산 입금 내역이 없습니다.</p>}

      {result && result.items.length > 0 && (
        <ul className="item-list">
          {result.items.map((item) => (
            <li key={item.settlementId}>
              <Link to={`/merchant/${item.merchantId}/settlements/${item.settlementId}`} className="item">
                <span className="item-main">
                  <span>{settlementMerchantLabel(item)}</span>
                  <span className="amount received">+{formatAmount(item.amount, item.currency)}</span>
                </span>
                <span className="item-sub">
                  <span className="hint">
                    {formatDateTime(settlementPaidTime(item))} 입금 · 결제 {item.paymentCount}건
                  </span>
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
