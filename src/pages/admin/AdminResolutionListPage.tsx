import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { PageResponse } from '../../api'
import { isAbortError, isUuid, pageParam } from '../../features/admin/input'
import {
  RECORD_DOMAINS,
  RECORD_DOMAIN_LABEL,
  RECORD_TARGET_LABEL,
  fetchRecords,
  isRecordDomain,
  type PaymentRecordType,
  type RecordRow,
} from '../../features/admin/records'
import { resolutionRecordPath, toAdminMessage, type RecordDomain } from '../../features/admin/reviews'
import { formatDateTime } from '../../lib/datetime'

const PAGE_SIZE = 20

function isPaymentType(value: string | null): value is PaymentRecordType {
  return value === 'PAYMENT' || value === 'REFUND'
}

/** MANUAL_REVIEW 처리 기록(최신순). 결제·환불, 정산, 환전을 탭으로 나누고 도메인별 조건으로 거른다. */
export function AdminResolutionListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const domainParam = searchParams.get('domain')
  const domain: RecordDomain = isRecordDomain(domainParam) ? domainParam : 'payment'
  const typeParam = searchParams.get('type')
  const type = domain === 'payment' && isPaymentType(typeParam) ? typeParam : undefined
  const actorParam = searchParams.get('actorId') ?? ''
  const actorId = isUuid(actorParam) ? actorParam : undefined
  const targetParam = searchParams.get('targetId') ?? ''
  const targetId = isUuid(targetParam) ? targetParam : undefined
  const page = pageParam(searchParams.get('page'))

  const [actorInput, setActorInput] = useState(actorParam)
  const [targetInput, setTargetInput] = useState(targetParam)
  const [filterError, setFilterError] = useState<string | null>(null)
  const [result, setResult] = useState<PageResponse<RecordRow> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setResult(null)
    setError(null)
    fetchRecords(domain, { type, actorId, targetId, page, size: PAGE_SIZE }, controller.signal)
      .then(setResult)
      .catch((cause) => {
        if (!isAbortError(cause)) {
          setError(toAdminMessage(cause, '처리 기록을 불러오지 못했습니다.'))
        }
      })
    return () => controller.abort()
  }, [domain, type, actorId, targetId, page, reloadToken])

  function update(next: { domain?: RecordDomain; type?: string; actorId?: string; targetId?: string; page?: number }) {
    const params = new URLSearchParams()
    const nextDomain = next.domain ?? domain
    params.set('domain', nextDomain)
    // 도메인을 바꾸면 대상 ID·종류는 뜻이 달라 비운다. 처리 담당자는 그대로 둔다.
    const domainChanged = next.domain !== undefined && next.domain !== domain
    const nextType = domainChanged ? '' : (next.type ?? type ?? '')
    if (nextDomain === 'payment' && nextType) {
      params.set('type', nextType)
    }
    const nextActor = next.actorId ?? actorId ?? ''
    if (nextActor) {
      params.set('actorId', nextActor)
    }
    const nextTarget = domainChanged ? '' : (next.targetId ?? targetId ?? '')
    if (nextTarget) {
      params.set('targetId', nextTarget)
    }
    if (next.page) {
      params.set('page', String(next.page))
    }
    if (domainChanged) {
      setTargetInput('')
    }
    setSearchParams(params)
  }

  function handleFilter(event: FormEvent) {
    event.preventDefault()
    const actor = actorInput.trim()
    const target = targetInput.trim()
    if ((actor && !isUuid(actor)) || (target && !isUuid(target))) {
      setFilterError('ID는 UUID 형식으로 입력해 주세요.')
      return
    }
    setFilterError(null)
    update({ actorId: actor, targetId: target })
  }

  return (
    <section>
      <div className="title-row">
        <h1>처리 기록</h1>
        <button type="button" className="link-button" onClick={() => setReloadToken((value) => value + 1)}>
          새로고침
        </button>
      </div>
      <p className="hint">
        운영자가 처리 대기(MANUAL_REVIEW) 건을 처리해 상태가 바뀐 기록입니다(최신 순). 송금 확정은 송금 상세의 이력, 충전
        보정은 충전 화면에서 봅니다.
      </p>

      <div className="tabs" role="tablist">
        {RECORD_DOMAINS.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={item === domain}
            className={item === domain ? 'tab active' : 'tab'}
            onClick={() => update({ domain: item })}
          >
            {RECORD_DOMAIN_LABEL[item]}
          </button>
        ))}
      </div>

      {domain === 'payment' && (
        <div className="form">
          <label>
            종류
            <select value={type ?? ''} onChange={(event) => update({ type: event.target.value })}>
              <option value="">전체</option>
              <option value="PAYMENT">결제</option>
              <option value="REFUND">환불</option>
            </select>
          </label>
        </div>
      )}
      <form className="form" onSubmit={handleFilter} noValidate>
        <label>
          처리 담당자 ID
          <input
            value={actorInput}
            onChange={(event) => setActorInput(event.target.value)}
            placeholder="UUID"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <label>
          {RECORD_TARGET_LABEL[domain]}
          {domain === 'payment' && ' (그 결제의 환불 포함)'}
          <input
            value={targetInput}
            onChange={(event) => setTargetInput(event.target.value)}
            placeholder="UUID"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        {filterError && <p className="field-error">{filterError}</p>}
        <button type="submit">검색</button>
      </form>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!result && !error && <p>불러오는 중입니다…</p>}
      {result && result.items.length === 0 && <p className="hint">조건에 맞는 처리 기록이 없습니다.</p>}
      {result && result.items.length > 0 && (
        <ul className="item-list">
          {result.items.map((item) => (
            <li key={item.id}>
              <Link to={resolutionRecordPath(domain, item.targetId)} className="item">
                <span className="item-main">
                  <span>
                    {item.kindLabel} {item.subjectId.slice(0, 8)}
                  </span>
                  <span>{item.resultLabel}</span>
                </span>
                <span className="item-sub">
                  <span className="hint">{formatDateTime(item.processedAt)}</span>
                  <span className="hint">담당자 {item.actorId.slice(0, 8)}</span>
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
