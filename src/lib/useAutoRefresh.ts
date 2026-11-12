import { useCallback, useEffect, useRef, useState } from 'react'

export const AUTO_REFRESH_INTERVAL_MS = 5000

export interface AutoRefreshOptions {
  /** 다음 조회까지 기다리는 시간. 앞 조회가 끝난 뒤부터 센다. */
  intervalMs?: number
  /** false면 조회하지 않는다. 다시 true가 되면 바로 한 번 조회하고 갱신을 이어 간다. */
  enabled?: boolean
}

export interface AutoRefreshResult<T> {
  /** 마지막으로 성공한 응답. 갱신이 실패해도 지우지 않는다. */
  data: T | null
  /** 마지막 조회가 실패했으면 그 예외, 성공했으면 null. */
  error: unknown
  /** 바로 다시 조회한다. 조회 중이면 무시한다. */
  reload: () => void
}

function isAbort(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === 'AbortError'
}

/**
 * 처음 한 번 조회하고 `intervalMs`마다 다시 조회한다.
 * - 탭이 보이지 않으면 멈추고, 다시 보이면 바로 조회한 뒤 이어 간다.
 * - 앞 조회가 끝나기 전에는 새 조회를 보내지 않는다(다음 조회는 앞 조회가 끝난 뒤 예약).
 * - 실패하면 `error`만 바꾸고 `data`는 마지막 성공 값을 유지한다.
 */
export function useAutoRefresh<T>(
  load: (signal: AbortSignal) => Promise<T>,
  { intervalMs = AUTO_REFRESH_INTERVAL_MS, enabled = true }: AutoRefreshOptions = {},
): AutoRefreshResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<unknown>(null)
  const loadRef = useRef(load)
  const runRef = useRef<() => void>(() => undefined)

  useEffect(() => {
    loadRef.current = load
  }, [load])

  useEffect(() => {
    if (!enabled) {
      return
    }
    const controller = new AbortController()
    let disposed = false
    let inFlight = false
    let timer: number | undefined

    const visible = () => document.visibilityState !== 'hidden'

    const schedule = () => {
      window.clearTimeout(timer)
      timer = !disposed && visible() ? window.setTimeout(run, intervalMs) : undefined
    }

    async function run() {
      if (disposed || inFlight) {
        return
      }
      window.clearTimeout(timer)
      timer = undefined
      inFlight = true
      try {
        const next = await loadRef.current(controller.signal)
        if (!disposed) {
          setData(next)
          setError(null)
        }
      } catch (cause) {
        if (!disposed && !isAbort(cause)) {
          setError(cause)
        }
      } finally {
        inFlight = false
        schedule()
      }
    }

    const handleVisibility = () => {
      if (visible()) {
        void run()
      } else {
        window.clearTimeout(timer)
        timer = undefined
      }
    }

    runRef.current = () => void run()
    document.addEventListener('visibilitychange', handleVisibility)
    if (visible()) {
      void run()
    }
    return () => {
      disposed = true
      runRef.current = () => undefined
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', handleVisibility)
      controller.abort()
    }
  }, [enabled, intervalMs])

  const reload = useCallback(() => runRef.current(), [])
  return { data, error, reload }
}
