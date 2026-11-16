import { useCallback, useEffect, useRef, useState } from 'react'

export const AUTO_REFRESH_INTERVAL_MS = 5000

export interface AutoRefreshOptions {
  /** 다음 조회까지 기다리는 시간. 앞 조회가 끝난 뒤부터 센다. 바뀌면 다음 조회만 다시 예약한다. */
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
 * - `intervalMs`가 바뀌어도 바로 조회하지 않고 다음 조회 시점만 다시 잡는다.
 * - 요청이 멈추는 것은 `load` 쪽 대기 한도(`apiRequest`의 `timeoutMs`)로 끊는다. 끊기면 실패로 보고 다음 주기에 이어 간다.
 */
export function useAutoRefresh<T>(
  load: (signal: AbortSignal) => Promise<T>,
  { intervalMs = AUTO_REFRESH_INTERVAL_MS, enabled = true }: AutoRefreshOptions = {},
): AutoRefreshResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<unknown>(null)
  const loadRef = useRef(load)
  const intervalRef = useRef(intervalMs)
  const runRef = useRef<() => void>(() => undefined)
  const rescheduleRef = useRef<() => void>(() => undefined)

  useEffect(() => {
    loadRef.current = load
  }, [load])

  // 간격이 바뀌면 다시 조회하지 않고, 마지막 조회가 끝난 시점 기준으로 다음 조회만 다시 예약한다.
  useEffect(() => {
    intervalRef.current = intervalMs
    rescheduleRef.current()
  }, [intervalMs])

  useEffect(() => {
    if (!enabled) {
      return
    }
    const controller = new AbortController()
    let disposed = false
    let inFlight = false
    let timer: number | undefined
    let lastDoneAt = 0
    /** 조회마다 올리는 번호. 마지막으로 보낸 조회의 응답만 반영해 오래된 응답이 새 값을 덮지 않게 한다. */
    let latest = 0

    const visible = () => document.visibilityState !== 'hidden'

    const schedule = () => {
      window.clearTimeout(timer)
      timer = undefined
      if (disposed || inFlight || !visible()) {
        return
      }
      const wait = Math.max(0, lastDoneAt + intervalRef.current - Date.now())
      timer = window.setTimeout(run, wait)
    }

    async function run() {
      if (disposed || inFlight) {
        return
      }
      window.clearTimeout(timer)
      timer = undefined
      inFlight = true
      const id = ++latest
      try {
        const next = await loadRef.current(controller.signal)
        if (!disposed && id === latest) {
          setData(next)
          setError(null)
        }
      } catch (cause) {
        if (!disposed && id === latest && !isAbort(cause)) {
          setError(cause)
        }
      } finally {
        inFlight = false
        lastDoneAt = Date.now()
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
    rescheduleRef.current = schedule
    document.addEventListener('visibilitychange', handleVisibility)
    if (visible()) {
      void run()
    }
    return () => {
      disposed = true
      runRef.current = () => undefined
      rescheduleRef.current = () => undefined
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', handleVisibility)
      controller.abort()
    }
  }, [enabled])

  const reload = useCallback(() => runRef.current(), [])
  return { data, error, reload }
}
