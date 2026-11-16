import { NavLink } from 'react-router'

/**
 * 거래내역 도메인 탭. 통합 내역 API가 없어(원장 감사 API는 사용자용이 아님) 각 도메인의 기존 내역 화면을
 * 오가는 탭으로 둔다. 각 화면은 자기 도메인 API만 부른다. "전체" 탭은 합쳐 줄 API가 없어 두지 않는다.
 * 넓은 화면(768px 이상)은 "충전 내역"처럼 각 화면 제목과 같은 이름으로 보이고, 모바일은 다섯 탭이 한 줄에 들어가도록
 * "내역"을 숨겨 "충전"만 보인다(전부 붙이면 375px에서 탭 두 개가 화면 밖으로 밀린다). 읽기 프로그램에는 폭과 관계없이
 * "충전 내역"으로 읽히게 이름을 준다(보이는 글자가 이름 안에 들어 있음).
 */
export const HISTORY_TABS: { to: string; label: string }[] = [
  { to: '/wallet/charges', label: '충전' },
  { to: '/transfers', label: '송금' },
  { to: '/exchanges', label: '환전' },
  { to: '/payments', label: '결제' },
  { to: '/wallet/settlements', label: '정산 입금' },
]

export function HistoryTabs() {
  return (
    <nav className="history-tabs" aria-label="거래내역 종류">
      {HISTORY_TABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to} end aria-label={`${tab.label} 내역`}>
          {tab.label}
          <span className="history-tabs-suffix">내역</span>
        </NavLink>
      ))}
    </nav>
  )
}
