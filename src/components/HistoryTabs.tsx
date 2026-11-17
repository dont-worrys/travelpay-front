import { NavLink } from 'react-router'

/**
 * 거래내역 도메인 탭. 통합 내역 API가 없어(원장 감사 API는 사용자용이 아님) 각 도메인의 기존 내역 화면을
 * 오가는 탭으로 둔다. 각 화면은 자기 도메인 API만 부른다. "전체" 탭은 합쳐 줄 API가 없어 두지 않는다.
 * 이름은 모든 폭에서 "○○ 내역"이다. 모바일에서도 다섯 탭이 한 줄에 다 보이도록 좁은 화면에서는 탭을 같은 폭으로 나누고
 * 글씨·여백을 줄인다(index.css "거래내역 탭").
 */
export const HISTORY_TABS: { to: string; label: string }[] = [
  { to: '/wallet/charges', label: '충전 내역' },
  { to: '/transfers', label: '송금 내역' },
  { to: '/exchanges', label: '환전 내역' },
  { to: '/payments', label: '결제 내역' },
  { to: '/wallet/settlements', label: '정산 내역' },
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
