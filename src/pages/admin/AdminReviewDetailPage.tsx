import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { isApiError, isOutcomeUnknown } from '../../api'
import type { LedgerEntry } from '../../features/admin/api'
import { FieldList } from '../../features/admin/FieldList'
import {
  REVIEW_CONFIG,
  isLedgerLookupUnavailable,
  isReviewKind,
  toAdminMessage,
  type ReviewDetailView,
  type ReviewResolved,
} from '../../features/admin/reviews'
import { formatAmount } from '../../lib/money'

const MEMO_MAX = 255

function EntryList({ title, entries }: { title: string; entries: LedgerEntry[] | null }) {
  if (!entries || entries.length === 0) {
    return null
  }
  return (
    <>
      <h3>{title}</h3>
      <ul className="item-list">
        {entries.map((entry, index) => (
          <li key={index} className="item">
            <span className="item-main">
              <span>
                {entry.direction} · {entry.entryType}
              </span>
              <span className="amount">{formatAmount(entry.amount, entry.currency)}</span>
            </span>
            <span className="item-sub">
              <code className="hint">{entry.walletId}</code>
              <span className="hint">
                {entry.ownerType} · {entry.accountType}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}

/**
 * MANUAL_REVIEW 단건 확인과 처리. 서버가 원장을 조회해 예상 결과를 보여 주고, 처리도 같은 규칙으로 서버가 정한다.
 * 처리는 멱등성 키가 없지만 이미 처리된 건은 409라 다시 눌러도 두 번 반영되지 않는다.
 */
export function AdminReviewDetailPage() {
  const { kind: kindParam, targetId = '' } = useParams()
  const kind = isReviewKind(kindParam) ? kindParam : null

  const [detail, setDetail] = useState<ReviewDetailView | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const [memo, setMemo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resolveError, setResolveError] = useState<string | null>(null)
  /** 처리 응답을 받지 못한 상태. 새로고침으로 상태를 확인하거나 다시 처리한다. */
  const [uncertain, setUncertain] = useState(false)
  const [resolved, setResolved] = useState<ReviewResolved | null>(null)

  useEffect(() => {
    if (!kind) {
      return
    }
    const controller = new AbortController()
    setDetail(null)
    setLoadError(null)
    REVIEW_CONFIG[kind]
      .detail(targetId, controller.signal)
      .then(setDetail)
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') {
          return
        }
        setLoadError(toAdminMessage(cause, '불러오지 못했습니다.'))
      })
    return () => controller.abort()
  }, [kind, targetId, reloadToken])

  if (!kind) {
    return (
      <section>
        <h1>처리 대기</h1>
        <p className="error">알 수 없는 처리 종류입니다.</p>
        <Link to="/admin/reviews">처리 대기 목록</Link>
      </section>
    )
  }

  const config = REVIEW_CONFIG[kind]
  const listLink = `/admin/reviews?kind=${kind}`

  function reload() {
    setResolveError(null)
    setUncertain(false)
    setReloadToken((value) => value + 1)
  }

  async function handleResolve(event: FormEvent) {
    event.preventDefault()
    if (!kind || !detail?.expected) {
      return
    }
    const target = detail.expected.statusLabel ?? '서버가 정한 결과'
    if (!uncertain && !window.confirm(`이 ${config.noun}을(를) "${target}"(으)로 처리할까요?`)) {
      return
    }
    setSubmitting(true)
    setResolveError(null)
    try {
      setResolved(await config.resolve(targetId, memo))
      setUncertain(false)
    } catch (cause) {
      // 원장 조회 실패(503)는 서버가 처리하지 않았다고 알려 준 것이라 결과 모름이 아니다.
      if (!isLedgerLookupUnavailable(cause) && isOutcomeUnknown(cause)) {
        setUncertain(true)
      } else {
        setUncertain(false)
      }
      setResolveError(toAdminMessage(cause, '처리하지 못했습니다.'))
      if (isApiError(cause) && cause.status === 409 && cause.code.endsWith('_NOT_MANUAL_REVIEW')) {
        setDetail(null)
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (resolved) {
    return (
      <section>
        <h1>{config.label} 처리 완료</h1>
        <p className="notice">처리했습니다. 처리 기록에 관리자 ID와 메모가 남습니다.</p>
        <FieldList fields={resolved.fields} />
        <div className="actions">
          <Link to={resolved.recordPath} className="button-link">
            처리 기록 보기
          </Link>
          <Link to={listLink}>처리 대기 목록</Link>
        </div>
      </section>
    )
  }

  if (loadError || (!detail && resolveError)) {
    return (
      <section>
        <h1>{config.label} 확인</h1>
        <p className="error" role="alert">
          {resolveError ?? loadError}
        </p>
        <div className="actions">
          <Link to={listLink}>처리 대기 목록</Link>
        </div>
      </section>
    )
  }
  if (!detail) {
    return <p className="loading">불러오는 중입니다…</p>
  }

  const canResolve = !detail.ledgerLookupFailed && detail.expected?.resolvable === true

  return (
    <section>
      <div className="title-row">
        <h1>{config.label} 확인</h1>
        <button type="button" className="link-button" onClick={reload} disabled={submitting}>
          새로고침
        </button>
      </div>
      <p className="amount-large">{detail.amount}</p>
      <p className="hint">멈춘 사유: {detail.reasonLabel}</p>
      <FieldList fields={detail.fields} />

      <h2>원장 조회 결과</h2>
      {detail.ledgerLookupFailed || !detail.ledger ? (
        <p className="error">원장 조회에 실패했습니다. 잠시 후 새로고침해 예상 결과를 확인한 뒤 처리해 주세요.</p>
      ) : (
        <FieldList
          fields={[
            { label: '상태', value: detail.ledger.statusLabel },
            ...(detail.ledger.transactionId
              ? [{ label: '원장 거래 ID', value: detail.ledger.transactionId, code: true }]
              : []),
            ...(detail.ledger.declineReason ? [{ label: '거절 사유', value: detail.ledger.declineReason }] : []),
          ]}
        />
      )}

      {detail.expected && (
        <>
          <h2>처리하면</h2>
          {detail.expected.resolvable ? (
            <>
              <p className="amount-large">{detail.expected.statusLabel}</p>
              <p className="hint">{detail.expected.description}</p>
            </>
          ) : (
            <>
              <p className="error">처리할 수 없습니다. 원장 거래 내용이 기록과 달라 원장 보정과 원인 조사가 필요합니다.</p>
              <p className="hint">{detail.expected.description}</p>
            </>
          )}
          {detail.entries && (
            <>
              <EntryList title="기대 항목" entries={detail.entries.expected} />
              <EntryList title="원장 항목" entries={detail.entries.actual} />
            </>
          )}
        </>
      )}

      {canResolve && (
        <form className="form" onSubmit={handleResolve}>
          <label>
            운영 메모 (선택, {MEMO_MAX}자 이하 · 고객에게 보이지 않음)
            <input
              value={memo}
              maxLength={MEMO_MAX}
              onChange={(event) => setMemo(event.target.value)}
              disabled={submitting || uncertain}
            />
          </label>
          {resolveError && (
            <p className="error" role="alert">
              {resolveError}
            </p>
          )}
          {uncertain && (
            <p className="hint">
              처리됐는지 확인하지 못했습니다. <strong>새로고침</strong>으로 상태를 확인하거나 <strong>다시 처리</strong>해
              주세요. 이미 처리됐다면 처리 대상이 아니라고 나오며, 두 번 반영되지 않습니다.
            </p>
          )}
          <button type="submit" disabled={submitting}>
            {submitting ? '처리 중…' : uncertain ? '다시 처리' : '처리'}
          </button>
        </form>
      )}

      <div className="actions">
        <Link to={listLink}>처리 대기 목록</Link>
      </div>
    </section>
  )
}
