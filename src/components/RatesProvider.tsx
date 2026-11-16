import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { fetchExchangeRates, type ExchangeRate } from '../features/exchange/api'
import { AUTO_REFRESH_INTERVAL_MS, useAutoRefresh, type AutoRefreshResult } from '../lib/useAutoRefresh'

/**
 * 화면 공통 환율(상단 바 티커·홈) 갱신 간격.
 * - 공식 API 모드(`source` KOREAEXIM, 하루 한 번 고시): 처음 1회 + 5분마다.
 * - 5초 갱신 모드(`source` MOCK, 서버가 5초마다 새 값 수집): 5초마다.
 * - 환율 화면이 열려 있으면 모드와 관계없이 5초. 환율 화면도 이 조회를 같이 써서 티커와 같은 값을 보여 준다.
 */
const SHARED_INTERVAL_MS = 5 * 60 * 1000
const LIVE_INTERVAL_MS = AUTO_REFRESH_INTERVAL_MS

function loadRates(signal: AbortSignal) {
  return fetchExchangeRates(undefined, signal)
}

/** 서버가 5초마다 가짜 환율을 만드는 mock 모드인지. 응답의 `source`로만 판단한다. */
function isLiveSource(rates: ExchangeRate[]): boolean {
  return rates.some((rate) => rate.source === 'MOCK')
}

interface RatesContextValue extends AutoRefreshResult<ExchangeRate[]> {
  /** 티커·홈에 보여 줄지(관리자·로그인 확인 중엔 false). */
  shown: boolean
  /** 5초 갱신이 필요한 화면이 열려 있음을 알린다. 돌려준 함수로 해제한다. */
  subscribeLive: () => () => void
}

const RatesContext = createContext<RatesContextValue | undefined>(undefined)

/**
 * 레이아웃에서 한 번만 조회해 티커·홈·환율 화면이 같은 응답을 쓴다.
 * `enabled`가 false면 티커·홈에는 보여 주지 않고, 환율 화면이 열려 있을 때만 조회한다.
 */
export function RatesProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [liveSubscribers, setLiveSubscribers] = useState(0)
  const [liveSource, setLiveSource] = useState(false)

  const load = useCallback(async (signal: AbortSignal) => {
    const rates = await loadRates(signal)
    setLiveSource(isLiveSource(rates))
    return rates
  }, [])

  const intervalMs = liveSubscribers > 0 || liveSource ? LIVE_INTERVAL_MS : SHARED_INTERVAL_MS
  const { data, error, reload } = useAutoRefresh(load, { intervalMs, enabled: enabled || liveSubscribers > 0 })

  const subscribeLive = useCallback(() => {
    setLiveSubscribers((count) => count + 1)
    return () => setLiveSubscribers((count) => count - 1)
  }, [])

  const value = useMemo(
    () => ({ data, error, reload, shown: enabled, subscribeLive }),
    [data, error, reload, enabled, subscribeLive],
  )
  return <RatesContext.Provider value={value}>{children}</RatesContext.Provider>
}

/**
 * 공통 환율. 레이아웃 안이면 공유 응답을 쓰고, 밖(단독 테스트 등)이면 직접 조회한다.
 * 아직 없거나 조회에 실패했으면 null.
 */
export function useSharedRates(): ExchangeRate[] | null {
  const shared = useContext(RatesContext)
  const standalone = shared === undefined
  const { data } = useAutoRefresh(loadRates, { intervalMs: SHARED_INTERVAL_MS, enabled: standalone })
  if (standalone) {
    return data
  }
  return shared.shown ? shared.data : null
}

/**
 * 5초마다 갱신되는 환율(환율·환전·예약 입력 화면용). 레이아웃 안이면 공통 조회를 5초로 당겨 같이 쓰므로
 * 티커와 값·시점이 같고 요청도 한 번만 나간다. 밖이면 직접 5초마다 조회한다.
 * `enabled`가 false인 동안은 5초 갱신을 요청하지 않는다(환전 견적 확인 단계 등). 공유 값은 그대로 돌려준다.
 */
export function useLiveRates({ enabled = true }: { enabled?: boolean } = {}): AutoRefreshResult<ExchangeRate[]> {
  const shared = useContext(RatesContext)
  const standalone = shared === undefined
  const subscribeLive = shared?.subscribeLive
  const own = useAutoRefresh(loadRates, { intervalMs: LIVE_INTERVAL_MS, enabled: standalone && enabled })

  useEffect(() => (enabled ? subscribeLive?.() : undefined), [subscribeLive, enabled])

  if (standalone) {
    return own
  }
  return { data: shared.data, error: shared.error, reload: shared.reload }
}
