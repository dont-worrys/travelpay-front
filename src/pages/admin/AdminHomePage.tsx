import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import type { PageResponse } from '../../api'
import { fetchOverdueRefundRequests } from '../../features/admin/api'
import { isAbortError } from '../../features/admin/input'
import { REVIEW_CONFIG, REVIEW_KINDS, toAdminMessage } from '../../features/admin/reviews'
import { fetchAdminCharges, fetchAdminTransfers } from '../../features/admin/treasuryApi'

type Count = number | string

interface CountItem {
  key: string
  label: string
  to: string
  load: (signal: AbortSignal) => Promise<PageResponse<unknown>>
}

/** 처리 대기(MANUAL_REVIEW). 결제·환불·정산·환전은 공통 처리 화면, 송금·충전은 도메인별 화면으로 간다. */
const REVIEW_ITEMS: CountItem[] = [
  ...REVIEW_KINDS.map((kind) => ({
    key: kind,
    label: REVIEW_CONFIG[kind].label,
    to: `/admin/reviews?kind=${kind}`,
    load: (signal: AbortSignal) => REVIEW_CONFIG[kind].list({ page: 0, size: 1 }, signal),
  })),
  {
    key: 'transfer',
    label: '송금',
    to: '/admin/transfers?status=MANUAL_REVIEW&order=OLDEST',
    load: (signal) => fetchAdminTransfers({ status: 'MANUAL_REVIEW', page: 0, size: 1 }, signal),
  },
  {
    key: 'charge',
    label: '충전',
    to: '/admin/charges?status=MANUAL_REVIEW',
    load: (signal) => fetchAdminCharges({ status: 'MANUAL_REVIEW', page: 0, size: 1 }, signal),
  },
]

const OVERDUE_ITEM: CountItem = {
  key: 'overdue',
  label: '지연 환불 신청(3일 초과)',
  to: '/admin/refund-requests/overdue',
  load: (signal) => fetchOverdueRefundRequests({ page: 0, size: 1 }, signal),
}

function CountList({ items, counts }: { items: CountItem[]; counts: Record<string, Count> }) {
  return (
    <ul className="item-list">
      {items.map((item) => {
        const count = counts[item.key]
        return (
          <li key={item.key}>
            <Link to={item.to} className="item">
              <span className="item-main">
                <span>{item.label}</span>
                <span className={typeof count === 'string' ? 'error' : 'amount'}>
                  {count === undefined ? '…' : typeof count === 'number' ? `${count}건` : count}
                </span>
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

/** 관리자 첫 화면. 도메인별 처리 대기 건수와 관리 기능 입구. */
export function AdminHomePage() {
  const [counts, setCounts] = useState<Record<string, Count>>({})

  useEffect(() => {
    const controller = new AbortController()
    for (const item of [...REVIEW_ITEMS, OVERDUE_ITEM]) {
      item
        .load(controller.signal)
        .then((page) => setCounts((prev) => ({ ...prev, [item.key]: page.totalElements })))
        .catch((cause) => {
          if (!isAbortError(cause)) {
            setCounts((prev) => ({ ...prev, [item.key]: toAdminMessage(cause, '불러오지 못함') }))
          }
        })
    }
    return () => controller.abort()
  }, [])

  return (
    <section>
      <h1>관리자</h1>

      <h2>처리 대기 (MANUAL_REVIEW)</h2>
      <p className="hint">자동 처리가 멈춘 건입니다. 처리 결과는 서버가 원장(충전은 은행·원장) 조회로 확인합니다.</p>
      <CountList items={REVIEW_ITEMS} counts={counts} />

      <h2>환불 신청</h2>
      <CountList items={[OVERDUE_ITEM]} counts={counts} />

      <h2>관리</h2>
      <div className="actions">
        <Link to="/admin/transfers">송금 관리</Link>
        <Link to="/admin/charges">충전 관리</Link>
        <Link to="/admin/charges/reconciliations">충전 대사</Link>
        <Link to="/admin/resolutions">처리 기록</Link>
        <Link to="/admin/merchants/new" className="button-link">
          가맹점 생성
        </Link>
      </div>
    </section>
  )
}
