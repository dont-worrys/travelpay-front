import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { isApiError, isOutcomeUnknown, type PageResponse } from '../../api'
import { isAbortError, localDateTimeToIso, pageParam } from '../../features/admin/input'
import { toAdminMessage } from '../../features/admin/reviews'
import {
  fetchReconciliationRuns,
  runReconciliation,
  type ReconciliationRun,
  type ReconciliationRunStatus,
} from '../../features/admin/treasuryApi'
import { StatusBadge } from '../../components/StatusBadge'
import { RECONCILIATION_SUM_NOTE, RUN_STATUS, runStatusBadge } from '../../features/admin/treasuryStatus'
import { formatDateTime } from '../../lib/datetime'

const PAGE_SIZE = 20

const STATUSES = Object.keys(RUN_STATUS) as ReconciliationRunStatus[]

function isStatus(value: string | null): value is ReconciliationRunStatus {
  return value !== null && (STATUSES as string[]).includes(value)
}

/** 충전 대사 실행 목록과 수동 실행. 대사는 돈을 옮기지 않고 은행·원장·충전 기록을 맞춰 보기만 한다. */
export function AdminReconciliationListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const statusParam = searchParams.get('status')
  const status = isStatus(statusParam) ? statusParam : undefined
  const page = pageParam(searchParams.get('page'))

  const [result, setResult] = useState<PageResponse<ReconciliationRun> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const [lastRun, setLastRun] = useState<ReconciliationRun | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setResult(null)
    setError(null)
    fetchReconciliationRuns({ status, page, size: PAGE_SIZE }, controller.signal)
      .then(setResult)
      .catch((cause) => {
        if (!isAbortError(cause)) {
          setError(toAdminMessage(cause, '대사 실행 목록을 불러오지 못했습니다.'))
        }
      })
    return () => controller.abort()
  }, [status, page, reloadToken])

  function update(next: { status?: string; page?: number }) {
    const params = new URLSearchParams()
    const nextStatus = next.status ?? status ?? ''
    if (nextStatus) {
      params.set('status', nextStatus)
    }
    if (next.page) {
      params.set('page', String(next.page))
    }
    setSearchParams(params)
  }

  async function handleRun(event: FormEvent) {
    event.preventDefault()
    const fromIso = localDateTimeToIso(from)
    const toIso = localDateTimeToIso(to)
    if (fromIso === null || toIso === null) {
      setRunError('기간을 확인해 주세요.')
      return
    }
    if ((fromIso === undefined) !== (toIso === undefined)) {
      setRunError('기간은 시작과 끝을 모두 비우거나 모두 입력해 주세요.')
      return
    }
    if (fromIso && toIso && fromIso >= toIso) {
      setRunError('시작이 끝보다 앞서야 합니다.')
      return
    }
    setRunning(true)
    setRunError(null)
    setLastRun(null)
    try {
      setLastRun(await runReconciliation({ from: fromIso, to: toIso }))
      setReloadToken((value) => value + 1)
    } catch (cause) {
      setRunError(
        isApiError(cause) && cause.code === 'COMMON_INVALID_REQUEST'
          ? '대사할 수 없는 기간입니다. 기간은 1일 이하, 끝은 지금보다 5분 이전이어야 합니다.'
          : isOutcomeUnknown(cause)
          ? '대사 결과를 받지 못했습니다. 실행 중이거나 끝났을 수 있으니 목록을 새로고침해 확인해 주세요.'
          : toAdminMessage(cause, '대사를 실행하지 못했습니다.'),
      )
    } finally {
      setRunning(false)
    }
  }

  return (
    <section>
      <div className="title-row">
        <h1>충전 대사</h1>
        <button type="button" className="link-button" onClick={() => setReloadToken((value) => value + 1)}>
          새로고침
        </button>
      </div>

      <h2>수동 실행</h2>
      <p className="hint">
        기간을 비우면 스케줄러와 같은 기간을 대사합니다. 기간을 넣으면 그 기간(끝 미포함)을 다시 대사합니다. 기간은 1일
        이하, 끝은 지금보다 5분 이전이어야 합니다(서버 기본 설정). 끝까지 대사한 뒤 응답하므로 시간이 걸릴 수 있습니다.
      </p>
      <form className="form" onSubmit={handleRun} noValidate>
        <label>
          시작 (선택)
          <input type="datetime-local" value={from} onChange={(event) => setFrom(event.target.value)} disabled={running} />
        </label>
        <label>
          끝 (선택, 미포함)
          <input type="datetime-local" value={to} onChange={(event) => setTo(event.target.value)} disabled={running} />
        </label>
        {runError && (
          <p className="error" role="alert">
            {runError}
          </p>
        )}
        <button type="submit" disabled={running}>
          {running ? '대사 중…' : '대사 실행'}
        </button>
      </form>
      {lastRun && (
        <p className="notice" role="status">
          대사를 마쳤습니다({runStatusBadge(lastRun.status).label}). 대상 {lastRun.targetCount}건 · 어긋남{' '}
          {lastRun.mismatchCount}건 · 판정 보류 {lastRun.unverifiableCount}건.{' '}
          <Link to={`/admin/charges/reconciliations/${lastRun.runId}`}>결과 보기</Link>
        </p>
      )}
      {lastRun && <p className="hint">{RECONCILIATION_SUM_NOTE}</p>}

      <h2>실행 기록</h2>
      <div className="form">
        <label>
          상태
          <select value={status ?? ''} onChange={(event) => update({ status: event.target.value })}>
            <option value="">전체</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {RUN_STATUS[value].label}
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
      {!result && !error && <p>불러오는 중입니다…</p>}
      {result && result.items.length === 0 && <p className="hint">대사 실행 기록이 없습니다.</p>}
      {result && result.items.length > 0 && (
        <ul className="item-list">
          {result.items.map((run) => (
            <li key={run.runId}>
              <Link to={`/admin/charges/reconciliations/${run.runId}`} className="item">
                <span className="item-main">
                  <span>
                    {formatDateTime(run.periodFrom)} ~ {formatDateTime(run.periodTo)}
                  </span>
                  <StatusBadge {...runStatusBadge(run.status)} />
                </span>
                <span className="item-sub">
                  <span className="hint">
                    {run.runType === 'MANUAL' ? '기간 지정' : '자동 기간'} · 시작 {formatDateTime(run.startedAt)}
                  </span>
                  <span className="hint">
                    대상 {run.targetCount} · 어긋남 {run.mismatchCount} · 보류 {run.unverifiableCount}
                  </span>
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

      <div className="actions">
        <Link to="/admin/charges">충전 목록</Link>
      </div>
    </section>
  )
}
