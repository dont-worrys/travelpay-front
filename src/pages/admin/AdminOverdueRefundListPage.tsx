import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { PageResponse } from '../../api'
import { fetchOverdueRefundRequests, type OverdueRefundRequest } from '../../features/admin/api'
import { elapsedSince, isAbortError, pageParam } from '../../features/admin/input'
import { toAdminMessage } from '../../features/admin/reviews'
import { formatDateTime } from '../../lib/datetime'
import { formatAmount } from '../../lib/money'

/** 서버 최대 페이지 크기. */
const PAGE_SIZE = 100

/**
 * 고객이 환불을 신청한 뒤 3일 넘게 가맹점이 처리하지 않은 신청(오래된 순). 항목에서 관리자 결제 상세로 가서
 * 환불을 대신 실행하거나 거절할 수 있다. 경과 시간은 브라우저 시각 기준이다.
 */
export function AdminOverdueRefundListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const page = pageParam(searchParams.get('page'))

  const [result, setResult] = useState<PageResponse<OverdueRefundRequest> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setResult(null)
    setError(null)
    fetchOverdueRefundRequests({ page, size: PAGE_SIZE }, controller.signal)
      .then(setResult)
      .catch((cause) => {
        if (!isAbortError(cause)) {
          setError(toAdminMessage(cause, '지연 환불 신청을 불러오지 못했습니다.'))
        }
      })
    return () => controller.abort()
  }, [page, reloadToken])

  function goTo(next: number) {
    setSearchParams(next ? { page: String(next) } : {})
  }

  return (
    <section>
      <div className="title-row">
        <h1>지연 환불 신청</h1>
        <button type="button" className="link-button" onClick={() => setReloadToken((value) => value + 1)}>
          새로고침
        </button>
      </div>
      <p className="hint">
        신청 후 3일 넘게 가맹점이 처리하지 않은 환불 신청입니다(오래된 순). 가맹점 주인에게 처리를 요청하거나,
        상세에서 관리자가 직접 환불을 실행하거나 거절할 수 있습니다.
      </p>
      {result && <p>총 {result.totalElements}건</p>}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!result && !error && <p className="loading">불러오는 중입니다…</p>}
      {result && result.items.length === 0 && <p className="hint empty">지연된 환불 신청이 없습니다.</p>}
      {result && result.items.length > 0 && (
        <ul className="item-list">
          {result.items.map((item) => (
            <li key={item.paymentId} className="item">
              <span className="item-main">
                <span>신청 후 {elapsedSince(item.requestedAt)} 경과</span>
                <span className="amount">{formatAmount(item.amount, item.currency)}</span>
              </span>
              <span className="item-sub">
                <span className="hint">신청 {formatDateTime(item.requestedAt)}</span>
                <span className="hint">사유: {item.requestReason || '-'}</span>
              </span>
              <span className="item-sub">
                <span className="hint">
                  결제 <code>{item.paymentId}</code>
                </span>
                <Link to={`/admin/merchants/${item.merchantId}/payments/${item.paymentId}`}>상세·처리</Link>
              </span>
              <span className="item-sub">
                <span className="hint">
                  가맹점 <code>{item.merchantId}</code>
                </span>
                <span className="hint">
                  고객 <code>{item.userId}</code>
                </span>
              </span>
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
