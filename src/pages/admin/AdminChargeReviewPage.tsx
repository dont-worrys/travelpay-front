import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { isApiError, isOutcomeUnknown } from '../../api'
import { FieldList } from '../../features/admin/FieldList'
import { isAbortError, isUuid } from '../../features/admin/input'
import { toAdminMessage, type ReviewField } from '../../features/admin/reviews'
import {
  CHARGE_RESOLUTION_ACTIONS,
  fetchChargeReview,
  resolveCharge,
  type ChargeResolution,
  type ChargeResolutionAction,
  type ChargeResolveInput,
  type ChargeReview,
  type SourceFact,
} from '../../features/admin/treasuryApi'
import { CHARGE_STATUS } from '../../features/wallet/status'
import { formatDateTime } from '../../lib/datetime'
import { newIdempotencyKey } from '../../lib/idempotency'
import { formatAmount } from '../../lib/money'

const REASON_MAX = 500

const ACTION_LABEL: Record<ChargeResolutionAction, string> = {
  CONFIRM_COMPLETED: '완료로 확정',
  CONFIRM_FAILED: '실패로 확정',
  CONFIRM_REFUNDED: '환불됨으로 확정',
  RESUME_CREDIT: '원장 적립 단계로 재개',
  RESUME_REFUND: '은행 환불 단계로 재개',
}

/** 재개(RESUME_CREDIT·RESUME_REFUND) 뒤 충전 상태. 서버 복구 스케줄러가 이어서 처리한다. */
const RESUMED_STATUSES = new Set<string>(['CREDIT_PROCESSING', 'REFUND_PROCESSING'])

const LOOKUP_LABEL: Record<string, string> = {
  FOUND: '있음',
  NOT_FOUND: '없음',
  UNAVAILABLE: '조회 실패',
}

function chargeStatusText(status: string): string {
  const info = CHARGE_STATUS[status as keyof typeof CHARGE_STATUS]
  return info ? `${info.label} (${status})` : status
}

function factText(fact: SourceFact): string {
  const lookup = LOOKUP_LABEL[fact.lookup] ?? fact.lookup
  if (fact.lookup !== 'FOUND') {
    return lookup
  }
  const parts = [fact.status ?? '-']
  if (fact.amount !== null) {
    parts.push(fact.currency ? formatAmount(fact.amount, fact.currency) : `${fact.amount.toLocaleString('ko-KR')}원`)
  }
  return `${lookup} · ${parts.join(' · ')}`
}

function factFields(source: { withdrawal: SourceFact; refund: SourceFact; ledger: SourceFact }): ReviewField[] {
  const rows: [string, SourceFact][] = [
    ['은행 출금', source.withdrawal],
    ['은행 환불', source.refund],
    ['원장 적립', source.ledger],
  ]
  const fields: ReviewField[] = []
  for (const [name, fact] of rows) {
    fields.push({ label: name, value: factText(fact) })
    if (fact.transactionId) {
      fields.push({ label: `${name} 거래 ID`, value: fact.transactionId, code: true })
    }
  }
  return fields
}

/** 거절 응답 `details`의 거절 이유(`reason`)들. */
function rejectionReasons(cause: unknown): string[] {
  if (!isApiError(cause)) {
    return []
  }
  return cause.details.filter((detail) => detail.field === 'reason').map((detail) => detail.message)
}

/**
 * MANUAL_REVIEW 충전 보정. 확인(review)으로 지금 은행·원장 사실과 가능한 조치를 보고, 조치와 사유를 골라 보정한다.
 * 보정은 `Idempotency-Key`가 필수다. 결과를 모르면 입력을 잠그고 같은 키·같은 본문으로만 다시 보낸다.
 * 서버가 반영하지 않았다고 확정한 거절(4xx, 조회 불가 503)은 키를 쓰지 않으므로 다음 보정은 새 키로 보낸다.
 */
export function AdminChargeReviewPage() {
  const { chargeId = '' } = useParams()
  const [searchParams] = useSearchParams()

  const [review, setReview] = useState<ChargeReview | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const [action, setAction] = useState<ChargeResolutionAction | ''>('')
  const [reason, setReason] = useState('')
  const [resultId, setResultId] = useState(searchParams.get('resultId') ?? '')
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [resolveError, setResolveError] = useState<string | null>(null)
  const [rejectReasons, setRejectReasons] = useState<string[]>([])
  /** 결과를 모르는 보정 요청. 다시 보낼 때 같은 키·같은 본문을 쓴다. */
  const [pending, setPending] = useState<{ key: string; body: ChargeResolveInput } | null>(null)
  const [resolved, setResolved] = useState<ChargeResolution | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setReview(null)
    setLoadError(null)
    fetchChargeReview(chargeId, controller.signal)
      .then((data) => {
        setReview(data)
        setAction((current) => (current && data.availableActions.includes(current) ? current : ''))
      })
      .catch((cause) => {
        if (!isAbortError(cause)) {
          setLoadError(toAdminMessage(cause, '충전 확인 결과를 불러오지 못했습니다.'))
        }
      })
    return () => controller.abort()
  }, [chargeId, reloadToken])

  function reload() {
    setResolveError(null)
    setRejectReasons([])
    setReloadToken((value) => value + 1)
  }

  async function send(key: string, body: ChargeResolveInput) {
    setSubmitting(true)
    setResolveError(null)
    setRejectReasons([])
    try {
      setResolved(await resolveCharge(chargeId, body, key))
      setPending(null)
    } catch (cause) {
      const definite =
        isApiError(cause) && (cause.code === 'CHARGE_RESOLUTION_SOURCE_UNAVAILABLE' || !isOutcomeUnknown(cause))
      if (definite) {
        setPending(null)
        setRejectReasons(rejectionReasons(cause))
      } else {
        setPending({ key, body })
      }
      setResolveError(
        definite
          ? toAdminMessage(cause, '보정하지 못했습니다.')
          : '보정 결과를 확인하지 못했습니다. 같은 내용으로 다시 보내면 이미 반영된 보정은 두 번 반영되지 않고 처음 결과를 돌려받습니다.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!action) {
      setFormError('보정 조치를 골라 주세요.')
      return
    }
    const trimmed = reason.trim()
    if (!trimmed) {
      setFormError('보정 사유를 입력해 주세요.')
      return
    }
    if (trimmed.length > REASON_MAX) {
      setFormError(`보정 사유는 ${REASON_MAX}자 이하로 입력해 주세요.`)
      return
    }
    const linked = resultId.trim()
    if (linked && !isUuid(linked)) {
      setFormError('대사 결과 ID(UUID) 형식이 아닙니다.')
      return
    }
    setFormError(null)
    if (!window.confirm(`이 충전을 "${ACTION_LABEL[action]}" 할까요?`)) {
      return
    }
    void send(newIdempotencyKey(), { action, reason: trimmed, reconciliationResultId: linked || undefined })
  }

  if (resolved) {
    // 재개는 충전을 처리 단계로 되돌릴 뿐 끝난 것이 아니다. 단건 조회 API가 없고 완료 시점도 정해져 있지 않아
    // 이 화면에서 다시 조회하지 않고, 결과는 관리자 충전 목록에서 확인하게 한다.
    const resumed = RESUMED_STATUSES.has(resolved.resultStatus)
    return (
      <section>
        <h1>{resumed ? '충전 처리 재개' : '충전 보정 완료'}</h1>
        {resumed ? (
          <>
            <p className="notice">
              충전을 {chargeStatusText(resolved.resultStatus)} 단계로 되돌렸습니다. 서버가 처리 중이며 완료 시점은 정해져
              있지 않습니다.
            </p>
            <p className="hint">
              결과는 충전 목록에서 확인해 주세요. 처리가 끝나면 이 상태 목록에서 빠지고 완료(COMPLETED)·환불
              완료(REFUNDED) 또는 다시 확인 중(MANUAL_REVIEW)이 됩니다. 보정 기록에는 처리 담당자와 사유가 남습니다.
            </p>
          </>
        ) : (
          <p className="notice">보정했습니다. 보정 기록에 처리 담당자와 사유, 확인한 은행·원장 사실이 남습니다.</p>
        )}
        <FieldList
          fields={[
            { label: '조치', value: ACTION_LABEL[resolved.action] ?? resolved.action },
            { label: '충전 상태', value: chargeStatusText(resolved.resultStatus) },
            { label: '처리 담당자 ID', value: resolved.operatorId, code: true },
            { label: '처리 시각', value: formatDateTime(resolved.resolvedAt) },
            { label: '사유', value: resolved.reason },
            { label: '보정 ID', value: resolved.resolutionId, code: true },
            ...(resolved.reconciliationResultId
              ? [{ label: '대사 결과 ID', value: resolved.reconciliationResultId, code: true }]
              : []),
            ...factFields(resolved),
          ]}
        />
        <div className="actions">
          {resumed ? (
            <Link to={`/admin/charges?status=${resolved.resultStatus}`}>
              충전 목록에서 확인({CHARGE_STATUS[resolved.resultStatus]?.label ?? resolved.resultStatus})
            </Link>
          ) : (
            <Link to="/admin/charges">충전 목록</Link>
          )}
        </div>
      </section>
    )
  }

  if (loadError) {
    return (
      <section>
        <h1>충전 보정</h1>
        <p className="error" role="alert">
          {loadError}
        </p>
        <div className="actions">
          <Link to="/admin/charges">충전 목록</Link>
        </div>
      </section>
    )
  }
  if (!review) {
    return <p>불러오는 중입니다…</p>
  }

  const locked = submitting || pending !== null
  const unavailable = new Map(review.unavailableActions.map((item) => [item.action, item.reasons]))

  return (
    <section>
      <div className="title-row">
        <h1>충전 보정</h1>
        <button type="button" className="link-button" onClick={reload} disabled={submitting}>
          다시 확인
        </button>
      </div>
      <p className="amount-large">{formatAmount(review.amount, review.currency)}</p>
      <FieldList
        fields={[
          { label: '충전 ID', value: review.chargeId, code: true },
          { label: '상태', value: chargeStatusText(review.status) },
          { label: '확인 중 전환', value: formatDateTime(review.manualReviewAt) },
          { label: '확인 시각', value: formatDateTime(review.checkedAt) },
        ]}
      />
      <p className="hint">
        아래는 지금 은행·원장을 조회한 사실이며 실행 허가가 아닙니다. 보정할 때 서버가 다시 조회해 판단하므로 그 사이
        상태가 바뀌면 거절될 수 있습니다.
      </p>

      <h2>은행·원장 사실</h2>
      <FieldList fields={factFields(review)} />

      {review.blockers.length > 0 && (
        <>
          <h2>판정할 수 없는 이유</h2>
          <ul>
            {review.blockers.map((blocker) => (
              <li key={blocker} className="error">
                {blocker}
              </li>
            ))}
          </ul>
        </>
      )}

      <h2>보정</h2>
      <form className="form" onSubmit={handleSubmit} noValidate>
        <div role="radiogroup" aria-label="조치" className="form">
          <span>조치</span>
          {CHARGE_RESOLUTION_ACTIONS.map((item) => {
            const reasons = unavailable.get(item)
            const allowed = review.availableActions.includes(item)
            const checked = pending ? pending.body.action === item : action === item
            return (
              <label key={item} className="inline">
                <input
                  type="radio"
                  name="action"
                  value={item}
                  checked={checked}
                  disabled={!allowed || locked}
                  onChange={() => setAction(item)}
                />
                <span>
                  {ACTION_LABEL[item]} <code>{item}</code>
                  {!allowed && reasons && reasons.length > 0 && <span className="hint"> — {reasons.join(' / ')}</span>}
                </span>
              </label>
            )
          })}
          {review.availableActions.length === 0 && <p className="hint">지금 가능한 조치가 없습니다.</p>}
        </div>
        <label>
          보정 사유 (필수, {REASON_MAX}자 이하 · 상태 이력에 남음)
          <input
            value={pending ? pending.body.reason : reason}
            maxLength={REASON_MAX}
            onChange={(event) => setReason(event.target.value)}
            disabled={locked}
          />
        </label>
        <label>
          연결할 대사 결과 ID (선택)
          <input
            value={pending ? (pending.body.reconciliationResultId ?? '') : resultId}
            onChange={(event) => setResultId(event.target.value)}
            placeholder="UUID"
            autoComplete="off"
            spellCheck={false}
            disabled={locked}
          />
        </label>
        {formError && <p className="field-error">{formError}</p>}
        {resolveError && (
          <p className="error" role="alert">
            {resolveError}
          </p>
        )}
        {rejectReasons.length > 0 && (
          <ul>
            {rejectReasons.map((item) => (
              <li key={item} className="hint">
                {item}
              </li>
            ))}
          </ul>
        )}
        {!pending && (
          <button type="submit" disabled={submitting || review.availableActions.length === 0}>
            {submitting ? '보정 중…' : '보정'}
          </button>
        )}
      </form>
      {pending && (
        <div className="actions">
          <button
            type="button"
            className="primary"
            onClick={() => void send(pending.key, pending.body)}
            disabled={submitting}
          >
            {submitting ? '보정 중…' : '같은 내용으로 다시 보내기'}
          </button>
        </div>
      )}

      <div className="actions">
        <Link to="/admin/charges">충전 목록</Link>
      </div>
    </section>
  )
}
