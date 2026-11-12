import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { PageResponse } from '../../api'
import {
  REVIEW_CONFIG,
  REVIEW_KINDS,
  isReviewKind,
  toAdminMessage,
  type ReviewKind,
  type ReviewRow,
} from '../../features/admin/reviews'
import { formatDateTime } from '../../lib/datetime'

const PAGE_SIZE = 20

/** MANUAL_REVIEW 목록. 결제·환불·정산·환전을 탭으로 나눠 같은 모양으로 보여 준다(오래된 순). */
export function AdminReviewListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const kindParam = searchParams.get('kind')
  const kind: ReviewKind = isReviewKind(kindParam) ? kindParam : 'payment'
  const config = REVIEW_CONFIG[kind]
  const reasonParam = searchParams.get('reason') ?? ''
  const reason = reasonParam in config.reasons ? reasonParam : ''
  const page = Math.max(0, Number.parseInt(searchParams.get('page') ?? '0', 10) || 0)

  const [result, setResult] = useState<PageResponse<ReviewRow> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setResult(null)
    setError(null)
    REVIEW_CONFIG[kind]
      .list({ reviewReason: reason || undefined, page, size: PAGE_SIZE }, controller.signal)
      .then(setResult)
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') {
          return
        }
        setError(toAdminMessage(cause, '목록을 불러오지 못했습니다.'))
      })
    return () => controller.abort()
  }, [kind, reason, page, reloadToken])

  function update(next: { kind?: ReviewKind; reason?: string; page?: number }) {
    const params = new URLSearchParams()
    const nextKind = next.kind ?? kind
    params.set('kind', nextKind)
    const nextReason = next.kind ? '' : (next.reason ?? reason)
    if (nextReason) {
      params.set('reason', nextReason)
    }
    const nextPage = next.page ?? 0
    if (nextPage) {
      params.set('page', String(nextPage))
    }
    setSearchParams(params)
  }

  return (
    <section>
      <div className="title-row">
        <h1>처리 대기</h1>
        <button type="button" className="link-button" onClick={() => setReloadToken((value) => value + 1)}>
          새로고침
        </button>
      </div>
      <p className="hint">자동 처리가 멈춘 건을 오래된 순으로 보여 줍니다.</p>

      <div className="tabs" role="tablist">
        {REVIEW_KINDS.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={item === kind}
            className={item === kind ? 'tab active' : 'tab'}
            onClick={() => update({ kind: item })}
          >
            {REVIEW_CONFIG[item].label}
          </button>
        ))}
      </div>

      <div className="form">
        <label>
          멈춘 사유
          <select value={reason} onChange={(event) => update({ reason: event.target.value })}>
            <option value="">전체</option>
            {Object.entries(config.reasons).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!result && !error && <p className="loading">불러오는 중입니다…</p>}
      {result && result.items.length === 0 && <p className="hint empty">처리를 기다리는 {config.noun}이 없습니다.</p>}
      {result && result.items.length > 0 && (
        <ul className="item-list">
          {result.items.map((item) => (
            <li key={item.id}>
              <Link to={`/admin/reviews/${kind}/${item.id}`} className="item">
                <span className="item-main">
                  <span>{item.summary}</span>
                  <span className="amount">{item.amount}</span>
                </span>
                <span className="item-sub">
                  <span className="hint">
                    {formatDateTime(item.createdAt)} · {item.attempt}
                  </span>
                  <span className="hint">{item.reasonLabel}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {result && result.totalPages > 1 && (
        <div className="pagination">
          <button type="button" className="secondary" disabled={page <= 0} onClick={() => update({ page: page - 1 })}>
            이전
          </button>
          <span>
            {result.page + 1} / {result.totalPages}
          </span>
          <button
            type="button"
            className="secondary"
            disabled={page + 1 >= result.totalPages}
            onClick={() => update({ page: page + 1 })}
          >
            다음
          </button>
        </div>
      )}
    </section>
  )
}
