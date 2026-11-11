import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { StatusBadge } from '../../components/StatusBadge'
import { FieldList } from '../../features/admin/FieldList'
import { isAbortError, pageParam } from '../../features/admin/input'
import { toAdminMessage, type ReviewField } from '../../features/admin/reviews'
import {
  fetchReconciliationRun,
  type MismatchType,
  type ReconciliationRunDetail,
} from '../../features/admin/treasuryApi'
import { MISMATCH_LABEL, runStatusBadge } from '../../features/admin/treasuryStatus'
import { formatDateTime } from '../../lib/datetime'

const PAGE_SIZE = 20
const MISMATCH_TYPES = Object.keys(MISMATCH_LABEL) as MismatchType[]

function isMismatchType(value: string | null): value is MismatchType {
  return value !== null && (MISMATCH_TYPES as string[]).includes(value)
}

function runFields(detail: ReconciliationRunDetail): ReviewField[] {
  const { run } = detail
  const fields: ReviewField[] = [
    { label: '실행 ID', value: run.runId, code: true },
    { label: '종류', value: run.runType === 'MANUAL' ? '기간 지정(MANUAL)' : '자동 기간(AUTO)' },
    { label: '기간', value: `${formatDateTime(run.periodFrom)} ~ ${formatDateTime(run.periodTo)} (끝 미포함)` },
  ]
  if (run.overlapFrom) {
    fields.push({ label: '겹쳐 다시 본 구간 시작', value: formatDateTime(run.overlapFrom) })
  }
  fields.push(
    { label: '시작', value: formatDateTime(run.startedAt) },
    { label: '종료', value: run.finishedAt ? formatDateTime(run.finishedAt) : '-' },
    { label: '대상', value: `${run.targetCount}건` },
    { label: '일치', value: `${run.matchedCount}건` },
    { label: '어긋남', value: `${run.mismatchCount}건` },
    { label: '판정 보류', value: `${run.unverifiableCount}건` },
  )
  if (run.failureReason) {
    fields.push({ label: '실패 사유', value: run.failureReason })
  }
  return fields
}

/** 대사 실행 요약과 어긋남 결과. 확인 중 충전의 결과는 그 결과 ID를 붙여 보정 화면으로 보낸다. */
export function AdminReconciliationDetailPage() {
  const { runId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const typeParam = searchParams.get('type')
  const mismatchType = isMismatchType(typeParam) ? typeParam : undefined
  const page = pageParam(searchParams.get('page'))

  const [detail, setDetail] = useState<ReconciliationRunDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setDetail(null)
    setError(null)
    fetchReconciliationRun(runId, { mismatchType, page, size: PAGE_SIZE }, controller.signal)
      .then(setDetail)
      .catch((cause) => {
        if (!isAbortError(cause)) {
          setError(toAdminMessage(cause, '대사 결과를 불러오지 못했습니다.'))
        }
      })
    return () => controller.abort()
  }, [runId, mismatchType, page, reloadToken])

  function update(next: { type?: string; page?: number }) {
    const params = new URLSearchParams()
    const nextType = next.type ?? mismatchType ?? ''
    if (nextType) {
      params.set('type', nextType)
    }
    if (next.page) {
      params.set('page', String(next.page))
    }
    setSearchParams(params)
  }

  if (error) {
    return (
      <section>
        <h1>대사 결과</h1>
        <p className="error" role="alert">
          {error}
        </p>
        <Link to="/admin/charges/reconciliations">충전 대사</Link>
      </section>
    )
  }
  if (!detail) {
    return <p>불러오는 중입니다…</p>
  }

  const { results } = detail

  return (
    <section>
      <div className="title-row">
        <h1>대사 결과</h1>
        <button type="button" className="link-button" onClick={() => setReloadToken((value) => value + 1)}>
          새로고침
        </button>
      </div>
      <p>
        <StatusBadge {...runStatusBadge(detail.run.status)} />
      </p>
      <FieldList fields={runFields(detail)} />

      <h2>어긋남 결과</h2>
      <div className="form">
        <label>
          종류
          <select value={mismatchType ?? ''} onChange={(event) => update({ type: event.target.value })}>
            <option value="">전체</option>
            {MISMATCH_TYPES.map((value) => (
              <option key={value} value={value}>
                {MISMATCH_LABEL[value]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {results.items.length === 0 && <p className="hint">어긋남 결과가 없습니다.</p>}
      {results.items.length > 0 && (
        <ul className="item-list">
          {results.items.map((item) => (
            <li key={item.resultId} className="item">
              <span className="item-main">
                <span>{MISMATCH_LABEL[item.mismatchType] ?? item.mismatchType}</span>
                <StatusBadge
                  label={item.resolutionStatus === 'RESOLVED' ? '보정됨' : '미처리'}
                  tone={item.resolutionStatus === 'RESOLVED' ? 'success' : 'warn'}
                />
              </span>
              {item.detail && (
                <span className="item-sub">
                  <span className="hint">{item.detail}</span>
                </span>
              )}
              <span className="item-sub">
                <span className="hint">
                  {formatDateTime(item.detectedAt)} · 결과 <code>{item.resultId}</code>
                </span>
              </span>
              <span className="item-sub">
                {item.chargeId ? (
                  <span className="hint">
                    충전 <code>{item.chargeId}</code>
                  </span>
                ) : (
                  <span className="hint">
                    {item.sourceType ?? '-'} <code>{item.sourceKey ?? '-'}</code>
                  </span>
                )}
                {item.chargeId && item.mismatchType === 'REVIEW_REQUIRED' && item.resolutionStatus === 'PENDING' && (
                  <Link to={`/admin/charges/${item.chargeId}/review?resultId=${item.resultId}`}>보정하기</Link>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {results.totalPages > 1 && (
        <div className="pagination">
          <button type="button" className="secondary" disabled={page <= 0} onClick={() => update({ page: page - 1 })}>
            이전
          </button>
          <span>
            {results.page + 1} / {results.totalPages}
          </span>
          <button
            type="button"
            className="secondary"
            disabled={page + 1 >= results.totalPages}
            onClick={() => update({ page: page + 1 })}
          >
            다음
          </button>
        </div>
      )}

      <div className="actions">
        <Link to="/admin/charges/reconciliations">충전 대사</Link>
      </div>
    </section>
  )
}
