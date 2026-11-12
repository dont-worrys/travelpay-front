import { createContext, useContext, type ReactNode } from 'react'
import { fetchExchangeRates, type ExchangeRate } from '../features/exchange/api'
import { useAutoRefresh } from '../lib/useAutoRefresh'

/** 화면 공통 환율(상단 바 티커·홈)은 자주 부르지 않는다: 처음 1회 + 5분마다. 환율 화면은 따로 5초 갱신. */
const SHARED_INTERVAL_MS = 5 * 60 * 1000

function loadRates(signal: AbortSignal) {
  return fetchExchangeRates(undefined, signal)
}

const RatesContext = createContext<ExchangeRate[] | null | undefined>(undefined)

/** 레이아웃에서 한 번만 조회해 티커와 홈이 같은 응답을 쓴다. `enabled`가 false면 조회하지 않는다. */
export function RatesProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const { data } = useAutoRefresh(loadRates, { intervalMs: SHARED_INTERVAL_MS, enabled })
  return <RatesContext.Provider value={enabled ? data : null}>{children}</RatesContext.Provider>
}

/**
 * 공통 환율. 레이아웃 안이면 공유 응답을 쓰고, 밖(단독 테스트 등)이면 직접 조회한다.
 * 아직 없거나 조회에 실패했으면 null.
 */
export function useSharedRates(): ExchangeRate[] | null {
  const shared = useContext(RatesContext)
  const standalone = shared === undefined
  const { data } = useAutoRefresh(loadRates, { intervalMs: SHARED_INTERVAL_MS, enabled: standalone })
  return standalone ? data : shared
}
