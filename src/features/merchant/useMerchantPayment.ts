import { useCallback, useEffect, useState } from 'react'
import type { Payment } from '../payment/api'
import { isProcessingPayment } from '../payment/status'
import { fetchMerchantPayment } from './api'

const POLL_INTERVAL_MS = 3000
const POLL_LIMIT_MS = 2 * 60 * 1000

/**
 * 가맹점 결제 상세 조회(가맹점 주인·`MASTER`). 처리 중이면 3초마다 최대 2분까지 다시 조회한다.
 * `reload`는 처음부터 다시 조회하고 폴링 시간을 새로 센다.
 */
export function useMerchantPayment(
  merchantId: string,
  paymentId: string,
  toMessage: (cause: unknown, fallback: string) => string,
) {
  const [payment, setPayment] = useState<Payment | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pollStopped, setPollStopped] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const startedAt = Date.now()
    let timer: number | undefined

    async function load() {
      try {
        const data = await fetchMerchantPayment(merchantId, paymentId, controller.signal)
        setPayment(data)
        setError(null)
        if (isProcessingPayment(data.status)) {
          if (Date.now() - startedAt < POLL_LIMIT_MS) {
            timer = window.setTimeout(load, POLL_INTERVAL_MS)
          } else {
            setPollStopped(true)
          }
        }
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') {
          return
        }
        setError(toMessage(cause, '결제를 불러오지 못했습니다.'))
      }
    }

    setPollStopped(false)
    load()
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
    // toMessage는 화면마다 고정된 함수라 다시 조회할 이유가 아니어서 의존성에서 뺀다.
  },[merchantId, paymentId, reloadToken])

  useEffect(() => {
    setPayment(null)
  }, [merchantId, paymentId])

  const reload = useCallback(() => setReloadToken((value) => value + 1), [])

  return { payment, setPayment, error, pollStopped, reload }
}
