import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { PageResponse } from '../../api'
import { isAbortError, isUuid, pageParam } from '../../features/admin/input'
import { toAdminMessage } from '../../features/admin/reviews'
import { fetchAdminTransfers, type AdminTransfer, type AdminTransferOrder } from '../../features/admin/treasuryApi'
import type { TransferStatus } from '../../features/transfer/api'
import { STATUS_LABEL } from '../../features/transfer/status'
import { TransferStatusBadge } from '../../features/transfer/TransferStatusBadge'
import { formatDateTime } from '../../lib/datetime'
import { formatAmount } from '../../lib/money'

const PAGE_SIZE = 20
const STATUSES = Object.keys(STATUS_LABEL) as TransferStatus[]

function isStatus(value: string | null): value is TransferStatus {
  return value !== null && (STATUSES as string[]).includes(value)
}

/** 전체 송금 목록. 상태·회원으로 거르고, 처리 대기(MANUAL_REVIEW)는 오래된 순으로 볼 수 있다. */
export function AdminTransferListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const statusParam = searchParams.get('status')
  const status = isStatus(statusParam) ? statusParam : undefined
  const userIdParam = searchParams.get('userId') ?? ''
  const userId = isUuid(userIdParam) ? userIdParam : undefined
  const orderType: AdminTransferOrder = searchParams.get('order') === 'OLDEST' ? 'OLDEST' : 'LATEST'
  const page = pageParam(searchParams.get('page'))

  const [userIdInput, setUserIdInput] = useState(userIdParam)
  const [userIdError, setUserIdError] = useState<string | null>(null)
  const [result, setResult] = useState<PageResponse<AdminTransfer> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setResult(null)
    setError(null)
    fetchAdminTransfers({ status, userId, orderType, page, size: PAGE_SIZE }, controller.signal)
      .then(setResult)
      .catch((cause) => {
        if (!isAbortError(cause)) {
          setError(toAdminMessage(cause, '송금 목록을 불러오지 못했습니다.'))
        }
      })
    return () => controller.abort()
  }, [status, userId, orderType, page, reloadToken])

  function update(next: { status?: string; userId?: string; order?: AdminTransferOrder; page?: number }) {
    const params = new URLSearchParams()
    const nextStatus = next.status ?? status ?? ''
    if (nextStatus) {
      params.set('status', nextStatus)
    }
    const nextUserId = next.userId ?? userId ?? ''
    if (nextUserId) {
      params.set('userId', nextUserId)
    }
    const nextOrder = next.order ?? orderType
    if (nextOrder === 'OLDEST') {
      params.set('order', nextOrder)
    }
    if (next.page) {
      params.set('page', String(next.page))
    }
    setSearchParams(params)
  }

  function handleUserSearch(event: FormEvent) {
    event.preventDefault()
    const value = userIdInput.trim()
    if (value && !isUuid(value)) {
      setUserIdError('회원 ID(UUID) 형식이 아닙니다.')
      return
    }
    setUserIdError(null)
    update({ userId: value })
  }

  return (
    <section>
      <div className="title-row">
        <h1>송금 관리</h1>
        <button type="button" className="link-button" onClick={() => setReloadToken((value) => value + 1)}>
          새로고침
        </button>
      </div>
      <p className="hint">모든 회원의 송금입니다. 처리 대기(확인 중) 송금은 상세에서 미리보기 후 확정합니다.</p>

      <div className="form">
        <label>
          상태
          <select value={status ?? ''} onChange={(event) => update({ status: event.target.value })}>
            <option value="">전체</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {STATUS_LABEL[value]} ({value})
              </option>
            ))}
          </select>
        </label>
        <label>
          정렬
          <select value={orderType} onChange={(event) => update({ order: event.target.value as AdminTransferOrder })}>
            <option value="LATEST">최신 순</option>
            <option value="OLDEST">오래된 순</option>
          </select>
        </label>
      </div>
      <form className="form" onSubmit={handleUserSearch}>
        <label>
          회원 ID (보낸 분 또는 받는 분)
          <div className="input-row">
            <input
              value={userIdInput}
              onChange={(event) => setUserIdInput(event.target.value)}
              placeholder="UUID"
              autoComplete="off"
              spellCheck={false}
            />
            <button type="submit">검색</button>
          </div>
        </label>
        {userIdError && <p className="field-error">{userIdError}</p>}
      </form>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!result && !error && <p className="loading">불러오는 중입니다…</p>}
      {result && result.items.length === 0 && <p className="hint empty">조건에 맞는 송금이 없습니다.</p>}
      {result && result.items.length > 0 && (
        <ul className="item-list">
          {result.items.map((item) => (
            <li key={item.transferId}>
              <Link to={`/admin/transfers/${item.transferId}`} className="item">
                <span className="item-main">
                  <span>
                    {item.senderId.slice(0, 8)} → {item.receiverId.slice(0, 8)}
                  </span>
                  <span className="amount">{formatAmount(item.amount, item.currency)}</span>
                </span>
                <span className="item-sub">
                  <span className="hint">
                    {formatDateTime(item.createdAt)} · 시도 {item.attemptCount}회
                  </span>
                  <TransferStatusBadge status={item.status} />
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
