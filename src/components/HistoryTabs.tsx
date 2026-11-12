import { NavLink } from 'react-router'

/**
 * 거래내역 도메인 탭. 통합 내역 API가 없어(원장 감사 API는 사용자용이 아님) 각 도메인의 기존 내역 화면을
 * 오가는 탭으로 둔다. 각 화면은 자기 도메인 API만 부른다. "전체" 탭은 합쳐 줄 API가 없어 두지 않는다.
 */
export const HISTORY_TABS: { to: string; label: string }[] = [
  { to: '/wallet/charges', label: '충전' },
  { to: '/transfers', label: '송금' },
  { to: '/exchanges', label: '환전' },
  { to: '/payments', label: '결제' },
]

export function HistoryTabs() {
  return (
    <nav className="history-tabs" aria-label="거래내역 종류">
      {HISTORY_TABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to} end>
          {tab.label}
        </NavLink>
      ))}
    </nav>
  )
}
