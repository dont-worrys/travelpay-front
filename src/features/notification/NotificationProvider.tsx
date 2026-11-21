import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { useAutoRefresh } from '../../lib/useAutoRefresh'
import { fetchUnreadNotificationCount } from './api'

/**
 * 읽지 않은 알림 개수 조회 간격. 백엔드 권장값(30초)을 따른다.
 * 개수는 모든 화면 헤더에 걸려 있어 회원 수만큼 계속 호출되므로 환율(5초)보다 길게 둔다.
 */
export const UNREAD_COUNT_INTERVAL_MS = 30_000

interface NotificationContextValue {
  /** 마지막으로 성공한 읽지 않은 개수. 아직 못 받았거나 조회하지 않으면 null. 조회가 실패해도 지우지 않는다. */
  unreadCount: number | null
  /** 바로 다시 조회한다(읽음 처리 뒤 등). */
  reloadUnreadCount: () => void
}

const NotificationContext = createContext<NotificationContextValue>({
  unreadCount: null,
  reloadUnreadCount: () => undefined,
})

async function loadUnreadCount(signal: AbortSignal): Promise<number> {
  return (await fetchUnreadNotificationCount(signal)).count
}

/**
 * 레이아웃에서 한 번만 조회해 헤더 배지와 알림 목록이 같은 값을 쓴다.
 * `enabled`가 false면(비로그인·MASTER·로그인 확인 중) 조회하지 않는다. MASTER는 서버가 403을 준다.
 * 탭이 숨겨지면 멈추고 돌아오면 바로 조회한다(`useAutoRefresh`).
 */
export function NotificationProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const { data, reload } = useAutoRefresh(loadUnreadCount, { intervalMs: UNREAD_COUNT_INTERVAL_MS, enabled })
  const unreadCount = enabled ? data : null
  const reloadUnreadCount = useCallback(() => reload(), [reload])
  const value = useMemo(() => ({ unreadCount, reloadUnreadCount }), [unreadCount, reloadUnreadCount])
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
}

export function useUnreadNotifications(): NotificationContextValue {
  return useContext(NotificationContext)
}
