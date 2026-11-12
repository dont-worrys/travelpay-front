import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { StatusBadge, type BadgeTone } from '../../components/StatusBadge'
import { fetchTerms, type TermItem } from '../../features/auth/api'
import { isAbortError, pageParam } from '../../features/admin/input'
import { fetchAdminTerms, type SlicePage } from '../../features/admin/memberApi'
import { toAdminMessage } from '../../features/admin/reviews'
import { formatDateTime } from '../../lib/datetime'

const PAGE_SIZE = 20

const termKey = (term: TermItem) => `${term.termsCode}:${term.termsVersion}`

type TermPhase = 'current' | 'scheduled' | 'past' | 'unknown'

const PHASE_BADGE: Record<TermPhase, { label: string; tone: BadgeTone } | null> = {
  current: { label: '시행 중', tone: 'success' },
  scheduled: { label: '시행 예정', tone: 'info' },
  past: { label: '지난 버전', tone: 'neutral' },
  unknown: null,
}

/**
 * 시행 중 여부는 공개 약관 조회(`GET /api/v1/terms`, 지금 시행 중인 버전)로 정한다.
 * 그 조회가 실패하면 시행 예정만 구분한다(시행 시각이 지난 버전은 시행 중인지 지난 버전인지 모름).
 */
function phaseOf(term: TermItem, current: Set<string> | null, now: number): TermPhase {
  if (new Date(term.effectiveAt).getTime() > now) {
    return 'scheduled'
  }
  if (!current) {
    return 'unknown'
  }
  return current.has(termKey(term)) ? 'current' : 'past'
}

/** 약관 버전 목록. 약관 코드 순, 같은 코드는 시행 시각 최신 순이며 지난·시행 예정 버전도 모두 나온다. */
export function AdminTermsListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const termsCode = searchParams.get('termsCode') ?? ''
  const page = pageParam(searchParams.get('page'))

  const [codeInput, setCodeInput] = useState(termsCode)
  const [result, setResult] = useState<SlicePage<TermItem> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [current, setCurrent] = useState<Set<string> | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setResult(null)
    setError(null)
    setNow(Date.now())
    fetchAdminTerms({ termsCode: termsCode || undefined, page, size: PAGE_SIZE }, controller.signal)
      .then(setResult)
      .catch((cause) => {
        if (!isAbortError(cause)) {
          setError(toAdminMessage(cause, '약관 목록을 불러오지 못했습니다.'))
        }
      })
    return () => controller.abort()
  }, [termsCode, page, reloadToken])

  useEffect(() => {
    let active = true
    fetchTerms()
      .then((items) => active && setCurrent(new Set(items.map(termKey))))
      .catch(() => active && setCurrent(null))
    return () => {
      active = false
    }
  }, [reloadToken])

  function update(next: { termsCode?: string; page?: number }) {
    const params = new URLSearchParams()
    const nextCode = next.termsCode ?? termsCode
    if (nextCode) {
      params.set('termsCode', nextCode)
    }
    if (next.page) {
      params.set('page', String(next.page))
    }
    setSearchParams(params)
  }

  function handleFilter(event: FormEvent) {
    event.preventDefault()
    update({ termsCode: codeInput.trim() })
  }

  return (
    <section>
      <div className="title-row">
        <h1>약관 관리</h1>
        <div className="actions inline">
          <button type="button" className="link-button" onClick={() => setReloadToken((value) => value + 1)}>
            새로고침
          </button>
          <Link
            to={termsCode ? `/admin/terms/new?termsCode=${encodeURIComponent(termsCode)}` : '/admin/terms/new'}
            className="button-link"
          >
            새 버전 등록
          </Link>
        </div>
      </div>
      <p className="hint">
        등록한 버전은 고치거나 지울 수 없습니다. 내용을 바꾸려면 새 버전을 시행 시각과 함께 등록합니다. 가입 화면에는
        시행 시각이 지난 버전 중 가장 최신 버전이 보입니다.
      </p>
      {!current && <p className="hint">지금 시행 중인 약관을 불러오지 못해 시행 중·지난 버전을 구분하지 않습니다.</p>}

      <form className="form" onSubmit={handleFilter}>
        <label>
          약관 코드
          <div className="input-row">
            <input
              value={codeInput}
              onChange={(event) => setCodeInput(event.target.value)}
              placeholder="예: SERVICE_TERMS (비우면 전체)"
              maxLength={40}
              autoComplete="off"
              spellCheck={false}
            />
            <button type="submit">검색</button>
          </div>
        </label>
      </form>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!result && !error && <p className="loading">불러오는 중입니다…</p>}
      {result && result.items.length === 0 && <p className="hint empty">조건에 맞는 약관이 없습니다.</p>}
      {result && result.items.length > 0 && (
        <ul className="item-list">
          {result.items.map((term) => {
            const badge = PHASE_BADGE[phaseOf(term, current, now)]
            return (
              <li key={termKey(term)} className="item">
                <span className="item-main">
                  <span>
                    <code>{term.termsCode}</code> · {term.termsVersion}
                  </span>
                  {badge && <StatusBadge label={badge.label} tone={badge.tone} />}
                </span>
                <span className="item-sub">
                  <span>
                    {term.title} ({term.isRequired ? '필수' : '선택'})
                  </span>
                  <span className="hint">시행 {formatDateTime(term.effectiveAt)}</span>
                </span>
                <details>
                  <summary className="hint">본문 보기</summary>
                  <pre className="terms-content">{term.content}</pre>
                </details>
              </li>
            )
          })}
        </ul>
      )}

      {result && (page > 0 || result.hasNext) && (
        <div className="pagination">
          <button type="button" className="secondary" disabled={page <= 0} onClick={() => update({ page: page - 1 })}>
            이전
          </button>
          <span>{page + 1} 페이지</span>
          <button
            type="button"
            className="secondary"
            disabled={!result.hasNext}
            onClick={() => update({ page: page + 1 })}
          >
            다음
          </button>
        </div>
      )}
    </section>
  )
}
