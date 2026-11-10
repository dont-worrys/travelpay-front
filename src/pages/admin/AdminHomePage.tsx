import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { REVIEW_CONFIG, REVIEW_KINDS, toAdminMessage, type ReviewKind } from '../../features/admin/reviews'

type Counts = Partial<Record<ReviewKind, number | string>>

/** 관리자 첫 화면. 도메인별 MANUAL_REVIEW 대기 건수와 관리 기능 입구. */
export function AdminHomePage() {
  const [counts, setCounts] = useState<Counts>({})

  useEffect(() => {
    const controller = new AbortController()
    for (const kind of REVIEW_KINDS) {
      REVIEW_CONFIG[kind]
        .list({ page: 0, size: 1 }, controller.signal)
        .then((page) => setCounts((prev) => ({ ...prev, [kind]: page.totalElements })))
        .catch((cause) => {
          if (cause instanceof DOMException && cause.name === 'AbortError') {
            return
          }
          setCounts((prev) => ({ ...prev, [kind]: toAdminMessage(cause, '불러오지 못함') }))
        })
    }
    return () => controller.abort()
  }, [])

  return (
    <section>
      <h1>관리자</h1>

      <h2>처리 대기 (MANUAL_REVIEW)</h2>
      <p className="hint">자동 처리가 멈춘 건입니다. 처리 결과는 서버가 원장 조회로 정합니다.</p>
      <ul className="item-list">
        {REVIEW_KINDS.map((kind) => {
          const count = counts[kind]
          return (
            <li key={kind}>
              <Link to={`/admin/reviews?kind=${kind}`} className="item">
                <span className="item-main">
                  <span>{REVIEW_CONFIG[kind].label}</span>
                  <span className={typeof count === 'string' ? 'error' : 'amount'}>
                    {count === undefined ? '…' : typeof count === 'number' ? `${count}건` : count}
                  </span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>

      <h2>가맹점</h2>
      <div className="actions">
        <Link to="/admin/merchants/new" className="button-link">
          가맹점 생성
        </Link>
      </div>
    </section>
  )
}
