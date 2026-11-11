import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { PageResponse } from '../../api'
import { isAbortError, isUuid, pageParam } from '../../features/admin/input'
import { toAdminMessage } from '../../features/admin/reviews'
import { fetchAdminCharges, type AdminCharge } from '../../features/admin/treasuryApi'
import type { ChargeStatus } from '../../features/wallet/api'
import { ChargeStatusBadge } from '../../features/wallet/ChargeStatusBadge'
import { CHARGE_STATUS, bankName } from '../../features/wallet/status'
import { formatDateTime } from '../../lib/datetime'
import { formatAmount } from '../../lib/money'

const PAGE_SIZE = 20
const STATUSES = Object.keys(CHARGE_STATUS) as ChargeStatus[]

function isStatus(value: string | null): value is ChargeStatus {
  return value !== null && (STATUSES as string[]).includes(value)
}

function ChargeItem({ item }: { item: AdminCharge }) {
  return (
    <>
      <span className="item-main">
        <span>
          회원 {item.userId.slice(0, 8)} · {bankName(item.bankCode)} {item.accountNumberMask}
        </span>
        <span className="amount">{formatAmount(item.amount, item.currency)}</span>
      </span>
      <span className="item-sub">
        <span className="hint">
          {formatDateTime(item.createdAt)} · {item.status} · 시도 {item.attemptCount}회
          {item.failureCode && ` · ${item.failureCode}`}
        </span>
        <ChargeStatusBadge status={item.status} />
      </span>
    </>
  )
}

/**
 * 전체 충전 목록(최신순 고정). 관리자 단건 조회 API가 없어 항목을 목록에서 모두 보여 주고,
 * 보정 대상(MANUAL_REVIEW)만 보정 화면으로 들어간다.
 */
export function AdminChargeListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const statusParam = searchParams.get('status')
  const status = isStatus(statusParam) ? statusParam : undefined
  const userIdParam = searchParams.get('userId') ?? ''
  const userId = isUuid(userIdParam) ? userIdParam : undefined
  const page = pageParam(searchParams.get('page'))

  const [userIdInput, setUserIdInput] = useState(userIdParam)
  const [userIdError, setUserIdError] = useState<string | null>(null)
  const [result, setResult] = useState<PageResponse<AdminCharge> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setResult(null)
    setError(null)
    fetchAdminCharges({ status, userId, page, size: PAGE_SIZE }, controller.signal)
      .then(setResult)
      .catch((cause) => {
        if (!isAbortError(cause)) {
          setError(toAdminMessage(cause, '충전 목록을 불러오지 못했습니다.'))
        }
      })
    return () => controller.abort()
  }, [status, userId, page, reloadToken])

  function update(next: { status?: string; userId?: string; page?: number }) {
    const params = new URLSearchParams()
    const nextStatus = next.status ?? status ?? ''
    if (nextStatus) {
      params.set('status', nextStatus)
    }
    const nextUserId = next.userId ?? userId ?? ''
    if (nextUserId) {
      params.set('userId', nextUserId)
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
        <h1>충전 관리</h1>
        <div className="actions inline">
          <Link to="/admin/charges/reconciliations">충전 대사</Link>
          <button type="button" className="link-button" onClick={() => setReloadToken((value) => value + 1)}>
            새로고침
          </button>
        </div>
      </div>
      <p className="hint">모든 회원의 충전입니다(최신 순). 확인 중(MANUAL_REVIEW) 충전을 눌러 보정합니다.</p>

      <div className="form">
        <label>
          상태
          <select value={status ?? ''} onChange={(event) => update({ status: event.target.value })}>
            <option value="">전체</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {CHARGE_STATUS[value].label} ({value})
              </option>
            ))}
          </select>
        </label>
      </div>
      <form className="form" onSubmit={handleUserSearch}>
        <label>
          회원 ID
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
      {!result && !error && <p>불러오는 중입니다…</p>}
      {result && result.items.length === 0 && <p className="hint">조건에 맞는 충전이 없습니다.</p>}
      {result && result.items.length > 0 && (
        <ul className="item-list">
          {result.items.map((item) =>
            item.status === 'MANUAL_REVIEW' ? (
              <li key={item.chargeId}>
                <Link to={`/admin/charges/${item.chargeId}/review`} className="item">
                  <ChargeItem item={item} />
                </Link>
              </li>
            ) : (
              <li key={item.chargeId} className="item">
                <ChargeItem item={item} />
              </li>
            ),
          )}
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
