import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { FieldList } from '../../features/admin/FieldList'
import { isAbortError } from '../../features/admin/input'
import { RECORD_DOMAIN_LABEL, RECORD_TARGET_LABEL, fetchRecords, isRecordDomain, type RecordRow } from '../../features/admin/records'
import { toAdminMessage } from '../../features/admin/reviews'
import { formatDateTime } from '../../lib/datetime'

/** 한 대상에 남은 처리 기록 최대 건수. 처리 기록은 상태가 바뀐 처리만 남아 대상마다 몇 건뿐이다. */
const MAX_RECORDS = 100

/**
 * 처리 대상 하나(결제와 그 환불, 정산, 환전 주문)의 처리 기록 상세. 처리 기록 API에 단건 조회가 없어
 * 대상 ID로 거른 목록을 모두 펼쳐 보여 준다. MANUAL_REVIEW 처리 완료 화면에서 이 화면으로 온다.
 */
export function AdminResolutionDetailPage() {
  const { domain: domainParam, targetId = '' } = useParams()
  const domain = isRecordDomain(domainParam) ? domainParam : null

  const [records, setRecords] = useState<RecordRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (!domain) {
      return
    }
    const controller = new AbortController()
    setRecords(null)
    setError(null)
    fetchRecords(domain, { targetId, page: 0, size: MAX_RECORDS }, controller.signal)
      .then((page) => setRecords(page.items))
      .catch((cause) => {
        if (!isAbortError(cause)) {
          setError(toAdminMessage(cause, '처리 기록을 불러오지 못했습니다.'))
        }
      })
    return () => controller.abort()
  }, [domain, targetId, reloadToken])

  if (!domain) {
    return (
      <section>
        <h1>처리 기록</h1>
        <p className="error">알 수 없는 처리 종류입니다.</p>
        <Link to="/admin/resolutions">처리 기록</Link>
      </section>
    )
  }

  const listLink = `/admin/resolutions?domain=${domain}`

  return (
    <section>
      <div className="title-row">
        <h1>{RECORD_DOMAIN_LABEL[domain]} 처리 기록</h1>
        <button type="button" className="link-button" onClick={() => setReloadToken((value) => value + 1)}>
          새로고침
        </button>
      </div>
      <p className="hint">
        {RECORD_TARGET_LABEL[domain]} <code>{targetId}</code>
      </p>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!records && !error && <p className="loading">불러오는 중입니다…</p>}
      {records && records.length === 0 && (
        <p className="hint">처리 기록이 없습니다. 방금 처리했다면 잠시 후 새로고침해 주세요.</p>
      )}
      {records?.map((record) => (
        <article key={record.id}>
          <h2>
            {record.kindLabel} · {formatDateTime(record.processedAt)}
          </h2>
          <FieldList fields={record.fields} />
        </article>
      ))}

      <div className="actions">
        <Link to={listLink}>처리 기록 목록</Link>
      </div>
    </section>
  )
}
